from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.work_order import BillingType


TWOPLACES = Decimal("0.01")


def _q(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


class ProformaStatus(str, Enum):
    pendiente = "pendiente"
    aprobada = "aprobada"
    rechazada = "rechazada"
    convertida = "convertida"


class ProformaItemCreate(BaseModel):
    description: str = Field(..., min_length=1)
    quantity: Decimal = Field(default=Decimal("1"), ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    part_name: str | None = None
    mechanic: str | None = None
    amount: Decimal | None = None

    @model_validator(mode="after")
    def compute_line(self):
        qty = _q(self.quantity if self.quantity is not None else 1)
        unit = _q(self.unit_price)
        pct = _q(self.discount_percent)
        gross = _q(qty * unit)
        discount = _q(gross * pct / Decimal("100"))
        self.quantity = qty
        self.unit_price = unit
        self.discount_percent = pct
        self.amount = _q(gross - discount)
        return self

    def line_figures(self) -> dict:
        gross = _q(self.quantity * self.unit_price)
        discount = _q(gross * self.discount_percent / Decimal("100"))
        return {
            "gross": gross,
            "discount": discount,
            "net": _q(gross - discount),
        }


class ProformaItemResponse(BaseModel):
    id: UUID
    proforma_id: UUID
    description: str
    quantity: Decimal = Decimal("1")
    unit_price: Decimal = Decimal("0")
    discount_percent: Decimal = Decimal("0")
    amount: Decimal = Decimal("0")
    part_name: str | None = None
    mechanic: str | None = None
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProformaCreate(BaseModel):
    client_id: UUID | None = None
    notes: str | None = None
    pieces: list[ProformaItemCreate] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_pieces(self):
        if not self.pieces:
            raise ValueError("Debe haber al menos una línea")
        return self


class ProformaUpdate(BaseModel):
    client_id: UUID | None = None
    notes: str | None = None
    pieces: list[ProformaItemCreate] | None = None
    status: ProformaStatus | None = None


class ProformaConvert(BaseModel):
    advance_amount: Decimal | None = Field(default=None, ge=0)
    register_advance: bool = False


class ProformaClientBrief(BaseModel):
    id: UUID
    name: str
    phone: str | None = None
    whatsapp: str | None = None


class ProformaResponse(BaseModel):
    id: UUID
    number: int | None = None
    client_id: UUID | None = None
    description: str | None = None
    billing_type: BillingType = BillingType.sin_factura
    neto_amount: Decimal = Decimal("0")
    iva_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    status: ProformaStatus = ProformaStatus.pendiente
    work_order_id: UUID | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
    client: ProformaClientBrief | None = None
    pieces: list[ProformaItemResponse] = []

    class Config:
        from_attributes = True
