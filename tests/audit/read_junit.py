import json
import sys
from xml.etree import ElementTree


root = ElementTree.parse(sys.argv[1]).getroot()
failures = []
for case in root.iter("testcase"):
    failure = case.find("failure")
    error = case.find("error")
    if failure is not None or error is not None:
        failures.append({"suite": "ai", "name": case.get("name"), "file": case.get("classname")})
print(json.dumps(failures))
