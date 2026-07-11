import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://biblicaljourney.net/api/tours/00451cbd-4964-4d8a-b60d-239d0942935a/days"
print(f"Requesting: {url}")

try:
    with urllib.request.urlopen(url, context=ctx) as response:
        status = response.getcode()
        body = response.read().decode('utf-8')
        print(f"Status: {status}")
        print("Response body:")
        print(json.dumps(json.loads(body), indent=2))
except Exception as e:
    print("Failed to request:", str(e))
