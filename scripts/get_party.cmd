@echo off
REM Usage: get_party.cmd <partyExternalId>
REM Example: get_party.cmd EXT-Party-001

set PARTY_EXT_ID=%~1
if "%PARTY_EXT_ID%"=="" (
    echo Usage: get_party.cmd ^<partyExternalId^>
    exit /b 1
)

python -c "import requests,urllib3,json,sys;urllib3.disable_warnings();cert=('config/certs/client.crt','config/certs/client.key');t=requests.post('https://eric-sec-access-mgmt.2l3ccaf.ocs.cht.com.tw/auth/realms/master/protocol/openid-connect/token',data={'grant_type':'password','client_id':'AuthorizationClient','username':'bssadmin','password':'BssAdmin@CHT2026!','scope':'openid'},verify=False).json()['access_token'];r=requests.get('https://bss-trf.2l3ccaf.ocs.cht.com.tw/bae/bssfIndividualPartyEnquiry/v1/individualParty/?externalId=%PARTY_EXT_ID%',headers={'Authorization':'Bearer '+t,'Content-Type':'application/json','Accept':'application/json','ERICSSON.Partition-Id':'1'},verify=False,cert=cert);print('Status:',r.status_code);print(json.dumps(r.json(),indent=2) if r.headers.get('content-type','').startswith('application/json') else r.text)"
