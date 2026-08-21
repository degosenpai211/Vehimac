from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.work_order import BillingType, OrderItemCreate


class ProformaStatus(str, Enum):
    pendiente = "pendiente"
    aprobada = "aprobada"
    rechazada = "rechazada"
    convertida = "convertida"


class ProformaItemResponse(OrderItemCreate):
    id: UUID
    proforma_id: UUID
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProformaCreate(BaseModel):
    client_id: UUID | None = None
    billing_type: BillingType = BillingType.sin_factura
    notes: str | None = None
    pieces: list[OrderItemCreate] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_pieces(self):
        if not self.pieces:
            raise ValueError("Debe haber al menos una pieza")
        return self


class ProformaUpdate(BaseModel):
    client_id: UUID | None = None
    billing_type: BillingType | None = None
    notes: str | None = None
    pieces: list[OrderItemCreate] | None = None
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
