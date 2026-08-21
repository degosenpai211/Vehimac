from decimal import Decimal

IVA_RATE = Decimal("0.13")


def compute_billing(neto: Decimal, billing_type: str) -> tuple[Decimal, Decimal]:
    """IVA se suma al neto (no está incluido). Neto 90 → IVA 11.70 → total 101.70."""
    neto = Decimal(str(neto or 0)).quantize(Decimal("0.01"))
    if billing_type == "con_factura" and neto > 0:
        iva = (neto * IVA_RATE).quantize(Decimal("0.01"))
        return iva, (neto + iva).quantize(Decimal("0.01"))
    return Decimal("0.00"), neto


def order_payable_total(order: dict) -> Decimal:
    total = order.get("total_amount")
    if total not in (None, 0, "0"):
        return Decimal(str(total))
    neto = Decimal(str(order.get("price_charged", 0)))
    iva = Decimal(str(order.get("iva_amount", 0)))
    return (neto + iva).quantize(Decimal("0.01"))
