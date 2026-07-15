import re
from pydantic import BaseModel, field_validator
from typing import Optional

MSISDN_PATTERN = re.compile(r"^\+?[1-9]\d{6,14}$")
IMSI_PATTERN = re.compile(r"^\d{14,15}$")


def _validate_msisdn(v: str) -> str:
    if not MSISDN_PATTERN.match(v):
        raise ValueError(f"Invalid MSISDN format: {v}. Expected E.164 (e.g. +46701234567)")
    return v


def _validate_imsi(v: str | None) -> str | None:
    if v and not IMSI_PATTERN.match(v):
        raise ValueError(f"Invalid IMSI format: {v}. Expected 14-15 digits")
    return v


class SubscriberProvision(BaseModel):
    givenName: str
    familyName: str
    msisdn: str
    email: Optional[str] = None
    productOfferingExternalId: Optional[str] = None
    imsi: Optional[str] = None
    billCycleSpecExternalId: Optional[str] = None

    @field_validator("msisdn")
    @classmethod
    def check_msisdn(cls, v):
        return _validate_msisdn(v)

    @field_validator("imsi")
    @classmethod
    def check_imsi(cls, v):
        return _validate_imsi(v)


class IndividualCreate(BaseModel):
    givenName: str
    familyName: str
    msisdn: str
    email: Optional[str] = None

    @field_validator("msisdn")
    @classmethod
    def check_msisdn(cls, v):
        return _validate_msisdn(v)


class CustomerCreate(BaseModel):
    partyExternalId: str
    msisdn: str
    billCycleSpecExternalId: Optional[str] = None

    @field_validator("msisdn")
    @classmethod
    def check_msisdn(cls, v):
        return _validate_msisdn(v)


class ContractCreate(BaseModel):
    customerExternalId: str
    msisdn: str
    productOfferingExternalId: Optional[str] = None
    billingAccountExternalId: Optional[str] = None
    imsi: Optional[str] = None

    @field_validator("msisdn")
    @classmethod
    def check_msisdn(cls, v):
        return _validate_msisdn(v)

    @field_validator("imsi")
    @classmethod
    def check_imsi(cls, v):
        return _validate_imsi(v)


class BalanceTopUp(BaseModel):
    customerExternalId: str
    contractExternalId: str
    msisdn: str
    amount: int
    unit: str = "euro"
    decimalPlaces: int = 0

    @field_validator("msisdn")
    @classmethod
    def check_msisdn(cls, v):
        return _validate_msisdn(v)


class TerminateRequest(BaseModel):
    externalId: str


class ProductStatusUpdate(BaseModel):
    status: str


class GenericApiRequest(BaseModel):
    """For calling any configured API directly."""
    apiKey: str
    body: Optional[dict] = None
    pathParams: Optional[dict] = None
    queryParams: Optional[dict] = None
