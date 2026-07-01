from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class WorkOrderStatus(str, Enum):
    en_proceso = "en_proceso"
    terminado = "terminado"
    entregado = "entregado"


class WorkOrderBase(BaseModel):
    client_id: UUID | None = None
    vehicle_type: str | None = None
    part_description: str | None = None
    work_description: str = Field(..., min_length=1)
    price_charged: Decimal = Field(default=Decimal("0"), ge=0)
    mechanic: str | None = None
    status: WorkOrderStatus = WorkOrderStatus.en_proceso
    estimated_delivery_date: date | None = None


class WorkOrderCreate(WorkOrderBase):
    pass


class WorkOrderUpdate(BaseModel):
    client_id: UUID | None = None
    vehicle_type: str | None = None
    part_description: str | None = None
    work_description: str | None = Field(None, min_length=1)
    price_charged: Decimal | None = Field(None, ge=0)
    mechanic: str | None = None
    status: WorkOrderStatus | None = None
    estimated_delivery_date: date | None = None


class ClientBrief(BaseModel):
    id: UUID
    name: str
    phone: str | None = None
    whatsapp: str | None = None


class WorkOrderResponse(WorkOrderBase):
    id: UUID
    entry_date: date
    finance_recorded: bool = False
    created_at: datetime
    updated_at: datetime
    client: ClientBrief | None = None

    class Config:
        from_attributes = True
