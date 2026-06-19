from pydantic import BaseModel
from typing import Optional


class SubscriberProvision(BaseModel):
    givenName: str
    familyName: str
    msisdn: str
    email: Optional[str] = None
    productOfferingId: str


class IndividualCreate(BaseModel):
    givenName: str
    familyName: str
    msisdn: str
    email: Optional[str] = None


class CustomerCreate(BaseModel):
    partyId: str
    msisdn: str


class CustomerExtIdCreate(BaseModel):
    partyId: str
    msisdn: str
    billingAccountSpecId: Optional[str] = ""
    bucketSpecId: Optional[str] = ""


class ContractCreate(BaseModel):
    customerId: str
    billingAccountId: str


class ContractUpdate(BaseModel):
    customerId: str
    contractId: str
    body: dict


class PPLCStateUpdate(BaseModel):
    customerId: str
    contractId: str
    newState: str = "PPLCAvailable"


class BalanceAdjustment(BaseModel):
    customerId: str
    billingAccountId: str
    bucketId: str
    amount: float
    unit: str = "euro"
    operation: str = "ADD"


class ProductBalanceAdjustment(BaseModel):
    customerId: str
    contractId: str
    productId: str
    productBucketId: str
    amount: float
    unit: str = "euro"
    operation: str = "ADD"


class VoucherlessRefill(BaseModel):
    msisdn: str
    amount: float
    unit: str = "euro"


class ProductStatusUpdate(BaseModel):
    status: str
