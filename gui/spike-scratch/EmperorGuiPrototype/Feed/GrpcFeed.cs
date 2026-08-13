// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// GrpcFeed — the real feed. It opens a gRPC channel to the C2 server's
// OperatorFeed.Subscribe server-stream and yields each SwarmState straight into
// the SAME pipeline FakeFeed uses. Selected with `--grpc` on the command line.
//
// !!! COMPILES BUT UNTESTED OVERNIGHT — no C2 server was running. The message
//     types and client stub are real (generated from robot.proto), so this
//     proves the CLIENT SIDE builds; the wire round-trip is the real spike's
//     first live milestone.
//
// TWO GOTCHAS the real spike will hit (both documented in MORNING_REPORT.md):
//  1. Cleartext HTTP/2 (h2c): the URL is `http://` (no TLS). Grpc.Net.Client
//     talks HTTP/2 prior-knowledge to an http:// address, which the C++ server
//     on 0.0.0.0:50051 accepts. If .NET ever refuses h2c, set the AppContext
//     switch "System.Net.Http.SocketsHttpHandler.Http2UnencryptedSupport"=true.
//  2. WSL<->Windows: PROJECT_NOTES pre-verified http://localhost:50051 works
//     ONLY because the WSL server binds 0.0.0.0 (not 127.0.0.1). Same fact,
//     restated where the client lives.
using System.Runtime.CompilerServices;
using Grpc.Core;
using Grpc.Net.Client;

namespace EmperorGuiPrototype.Feed;

public sealed class GrpcFeed : IFeed
{
    private readonly string _address;

    public GrpcFeed(string address = "http://localhost:50051") => _address = address;

    public async IAsyncEnumerable<Emperor.SwarmState> Subscribe(
        [EnumeratorCancellation] CancellationToken ct)
    {
        using var channel = GrpcChannel.ForAddress(_address);
        var client = new Emperor.OperatorFeed.OperatorFeedClient(channel);

        using var call = client.Subscribe(new Emperor.SubscribeRequest(), cancellationToken: ct);

        // ReadAllAsync (Grpc.Core extension) turns the server stream into the
        // same IAsyncEnumerable shape FakeFeed produces — one pipeline, two
        // sources. Cancellation flows through ct to tear the RPC down cleanly.
        await foreach (var frame in call.ResponseStream.ReadAllAsync(ct))
            yield return frame;
    }
}
