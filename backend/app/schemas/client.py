from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class PaymentMethod(str, Enum):
    contado = "contado"
    tarjeta_qr = "tarjeta_qr"
    adelanto = "adelanto"


class VehicleBase(BaseModel):
    make: str | None = Field(None, description="Marca")
    model: str | None = Field(None, description="Modelo")
    year: int | None = Field(None, description="Año")


class VehicleCreate(VehicleBase):
    pass


class VehicleResponse(VehicleBase):
    id: UUID
    client_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class ClientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phone: str | None = None
    whatsapp: str | None = None
    balance: Decimal = Field(default=Decimal("0"), le=0)
    payment_method: PaymentMethod | None = None
    notes: str | None = None


class ClientCreate(ClientBase):
    autos: list[VehicleCreate] = []


class ClientUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    phone: str | None = None
    whatsapp: str | None = None
    balance: Decimal | None = Field(None, le=0)
    payment_method: PaymentMethod | None = None
    notes: str | None = None

    @field_validator("balance")
    @classmethod
    def balance_no_fiado(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v > 0:
            raise ValueError("No se permite fiado. El saldo solo puede ser 0 o negativo (adelanto).")
        return v


class WorkOrderBrief(BaseModel):
    id: UUID
    ot_number: int | None = None
    work_description: str
    status: str
    price_charged: Decimal
    entry_date: str
    created_at: datetime


class ClientResponse(ClientBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    balance_updated_at: datetime | None = None
    autos: list[VehicleResponse] = []
    work_orders: list[WorkOrderBrief] = []
    stored_pieces_count: int = 0

    class Config:
        from_attributes = True
