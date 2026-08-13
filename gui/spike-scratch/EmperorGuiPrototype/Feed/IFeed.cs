// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// The feed seam. Both the in-process FakeFeed and the real GrpcFeed produce the
// SAME currency — a stream of generated `Emperor.SwarmState` protobufs — so the
// entire ViewModel/rendering pipeline is identical whether data is faked or
// live. This is the GUI-side echo of TECH_SPEC §6's gateway seam: put the
// abstraction where the world changes (here, the data source), not everywhere.
//
// IAsyncEnumerable models "a stream that arrives over time and can be awaited
// and cancelled" exactly — the idiomatic .NET shape for a gRPC server stream.
namespace EmperorGuiPrototype.Feed;

public interface IFeed
{
    IAsyncEnumerable<Emperor.SwarmState> Subscribe(CancellationToken ct);
}
