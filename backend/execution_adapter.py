import asyncio
from typing import Dict, Any, Optional


async def _call_possible_method(obj, method_names, *args, **kwargs):
    for name in method_names:
        if hasattr(obj, name):
            fn = getattr(obj, name)
            # run in thread if it's synchronous
            if asyncio.iscoroutinefunction(fn):
                return await fn(*args, **kwargs)
            else:
                return await asyncio.to_thread(fn, *args, **kwargs)
    raise AttributeError(f"No supported method found on object for {method_names}")


async def place_order(
    data_fetcher: Any,
    exchange: str,
    market_id: str,
    side: str,
    size_usd: float,
    price: Optional[float] = None,
    simulate: bool = True,
) -> Dict[str, Any]:
    """Attempt to place an order on the given exchange via the provided data_fetcher.

    This adapter does a best-effort: if `simulate` is True or no client is available
    it returns a simulated response. To enable real execution, provide SDK clients
    on `data_fetcher` (attributes `polymarket` and/or `kalshi`) exposing one of the
    common methods: `place_order`, `create_order`, `submit_order`, `trade`, `order`.
    """
    if simulate or data_fetcher is None:
        return {
            "success": True,
            "simulated": True,
            "executed_price": price,
            "filled_usd": size_usd,
            "exchange": exchange,
            "market_id": market_id,
        }

    try:
        client = None
        key = exchange.lower() if exchange else ""
        if key.startswith("poly") or key.startswith("polymarket"):
            client = getattr(data_fetcher, "polymarket", None)
        elif key.startswith("kalshi") or key.startswith("kx"):
            client = getattr(data_fetcher, "kalshi", None)
        else:
            client = getattr(data_fetcher, "polymarket", None) or getattr(data_fetcher, "kalshi", None)

        if client is None:
            return {"success": False, "error": "no client available"}

        # If market_id is not an id, try to resolve by searching markets
        if market_id and not market_id.isalnum():
            try:
                if hasattr(data_fetcher, "fetch_all_markets"):
                    markets = await data_fetcher.fetch_all_markets(source="all", limit=1000)
                elif hasattr(data_fetcher, "fetch_markets"):
                    markets = await data_fetcher.fetch_markets(limit=1000)
                else:
                    markets = []
                for m in markets:
                    q = (m.get("question") or m.get("title") or "").lower()
                    if q and q in market_id.lower():
                        market_id = m.get("id") or m.get("market_id") or market_id
                        break
            except Exception:
                pass

        method_candidates = ["place_order", "create_order", "submit_order", "trade", "order"]
        payload = {"market_id": market_id, "side": side, "size_usd": size_usd, "price": price}

        try:
            resp = await _call_possible_method(client, method_candidates, payload)
            return {"success": True, "simulated": False, "response": resp}
        except AttributeError:
            return {"success": False, "error": "no execution method on client"}
    except Exception as e:
        return {"success": False, "error": str(e)}
