from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class WorkOrderStatus(str, Enum):
    en_proceso = "en_proceso"
    terminado = "terminado"
    entregado = "entregado"


class BillingType(str, Enum):
    con_factura = "con_factura"
    sin_factura = "sin_factura"


class OrderItemCreate(BaseModel):
    part_name: str | None = None
    description: str = Field(..., min_length=1)
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    mechanic: str | None = None


class OrderItemResponse(OrderItemCreate):
    id: UUID
    work_order_id: UUID
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True


class WorkOrderBase(BaseModel):
    client_id: UUID | None = None
    estimated_delivery_date: date | None = None


class WorkOrderCreate(WorkOrderBase):
    pieces: list[OrderItemCreate] = Field(..., min_length=1)
    billing_type: BillingType = BillingType.sin_factura
    advance_amount: Decimal | None = Field(default=None, ge=0)
    register_advance: bool = False

    @model_validator(mode="after")
    def validate_pieces(self):
        if not self.pieces:
            raise ValueError("Debe haber al menos una pieza")
        return self


class QrPaymentCreate(BaseModel):
    bank: str = Field(..., min_length=1)
    amount: Decimal | None = Field(default=None, ge=0)


class WorkOrderUpdate(BaseModel):
    client_id: UUID | None = None
    estimated_delivery_date: date | None = None
    pieces: list[OrderItemCreate] | None = None
    advance_amount: Decimal | None = Field(default=None, ge=0)
    billing_type: BillingType | None = None
    register_advance: bool | None = None
    status: WorkOrderStatus | None = None


class ClientBrief(BaseModel):
    id: UUID
    name: str
    phone: str | None = None
    whatsapp: str | None = None


class WorkOrderResponse(BaseModel):
    id: UUID
    ot_number: int | None = None
    client_id: UUID | None = None
    work_description: str
    part_description: str | None = None
    price_charged: Decimal
    billing_type: BillingType = BillingType.sin_factura
    iva_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    mechanic: str | None = None
    status: WorkOrderStatus
    entry_date: date
    estimated_delivery_date: date | None = None
    advance_amount: Decimal = Decimal("0")
    advance_recorded: bool = False
    delivery_payment_recorded: bool = False
    finance_recorded: bool = False
    qr_paid: bool = False
    qr_bank: str | None = None
    qr_paid_amount: Decimal = Decimal("0")
    qr_paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    client: ClientBrief | None = None
    pieces: list[OrderItemResponse] = []

    class Config:
        from_attributes = True
