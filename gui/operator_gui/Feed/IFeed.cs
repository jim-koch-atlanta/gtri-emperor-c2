using Emperor;

namespace operator_gui.Feed;

/// <summary>
/// The feed seam. Both <see cref="FakeFeed"/> (in-process synthetic swarm) and
/// <see cref="GrpcFeed"/> (the real C2 server stream) produce the SAME currency —
/// generated <c>Emperor.SwarmState</c> frames — so MainViewModel consumes one
/// pipeline regardless of source. Choosing the feed is a one-line decision in
/// App.OnStartup; nothing downstream changes.
///
/// IAsyncEnumerable models "frames that arrive over time, awaitable and
/// cancellable" — the idiomatic .NET shape for a gRPC server stream.
/// </summary>
public interface IFeed
{
    IAsyncEnumerable<SwarmState> Subscribe(CancellationToken ct);
}
