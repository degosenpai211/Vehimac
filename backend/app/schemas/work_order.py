from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.commission_sheet import normalize_commission


class WorkOrderStatus(str, Enum):
    en_proceso = "en_proceso"
    terminado = "terminado"
    entregado = "entregado"


class BillingType(str, Enum):
    con_factura = "con_factura"
    sin_factura = "sin_factura"


class StepAssign(BaseModel):
    step_id: str
    technician: str = ""
    assigned_at: str | None = None
    status: str | None = None
    completed_at: str | None = None


class AdminHelpUpdate(BaseModel):
    enabled: bool


class CommissionPreview(BaseModel):
    commission: dict = Field(default_factory=dict)
    steps: list = Field(default_factory=list)


class OrderItemCreate(BaseModel):
    part_name: str | None = None
    description: str = Field(..., min_length=1)
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    mechanic: str | None = None
    designer: str | None = None
    process: dict | None = None

    @field_validator("process")
    @classmethod
    def clip_process_observation(cls, value):
        if not isinstance(value, dict):
            return value
        cleaned = dict(value)
        if cleaned.get("observation"):
            cleaned["observation"] = str(cleaned["observation"])[:80]
        if "commission" in cleaned:
            cleaned["commission"] = normalize_commission(cleaned.get("commission"))
        return cleaned


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
    designer: str | None = None
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
    photo_count: int = 0
    vehicle_label: str | None = None

    class Config:
        from_attributes = True
