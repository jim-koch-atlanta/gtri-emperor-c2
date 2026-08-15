using System.Runtime.CompilerServices;
using Emperor;
using Grpc.Core;
using Grpc.Net.Client;

namespace operator_gui.Feed;

/// <summary>
/// The real feed: subscribes to the C2 server's <c>OperatorFeed.Subscribe</c>
/// server stream and hands each SwarmState straight into the same pipeline
/// FakeFeed uses. Selected with the <c>--grpc</c> arg (or EMPEROR_FEED=grpc).
/// </summary>
public sealed class GrpcFeed : IFeed
{
    private readonly string _address;

    static GrpcFeed()
    {
        // h2c (cleartext HTTP/2): our endpoint is http:// with no TLS. Some .NET
        // hosts refuse HTTP/2 without TLS unless this switch is on; it's harmless
        // when unneeded. (MORNING_REPORT gotcha #7.) The C++ server binds
        // 0.0.0.0:50051 so WSL2 localhost-forwarding reaches it from Windows.
        AppContext.SetSwitch("System.Net.Http.SocketsHttpHandler.Http2UnencryptedSupport", true);
    }

    public GrpcFeed(string address = "http://localhost:50051") => _address = address;

    public async IAsyncEnumerable<SwarmState> Subscribe(
        [EnumeratorCancellation] CancellationToken ct)
    {
        using var channel = GrpcChannel.ForAddress(_address);
        var client = new OperatorFeed.OperatorFeedClient(channel);

        using var call = client.Subscribe(new SubscribeRequest(), cancellationToken: ct);

        // ReadAllAsync (Grpc.Core) turns the server stream into the same
        // IAsyncEnumerable shape FakeFeed yields — one pipeline, two sources.
        // Cancellation flows through ct to tear the RPC down cleanly.
        await foreach (var frame in call.ResponseStream.ReadAllAsync(ct))
            yield return frame;
    }

    public async Task<Accepted> SendCommand(OperatorCommand cmd)
    {
        using var channel = GrpcChannel.ForAddress(_address);
        var client = new OperatorFeed.OperatorFeedClient(channel);
        using var call = client.SendCommandAsync(cmd);
        return await call.ResponseAsync;
    }
}
