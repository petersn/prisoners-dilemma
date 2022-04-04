#!/usr/bin/python

import os
import re
import glob
import json
import asyncio
import websockets
import subprocess
import string

CHAR_WHITELIST = string.printable.replace(".", "").replace("/", "")

async def handler(websocket, path):
    while True:
        msg = await websocket.recv()
        print()
        print(msg)
        data = json.loads(msg)

        if data["kind"] == "submit":
            assert isinstance(data["myName"], str)
            dir_path = "./bots/" + "".join(c for c in data["myName"] if c in CHAR_WHITELIST)[:200]
            if not os.path.exists(dir_path):
                os.mkdir(dir_path)
            assert isinstance(data["position"], int)
            file_path = os.path.join(dir_path, "code-%i" % data["position"])
            print("Saving %i bytes to %s" % (len(data["code"]), file_path))
            with open(file_path, "w") as f:
                assert isinstance(data["code"], str)
                f.write(data["code"])
            await websocket.send('{"kind": "submitted", "position": %i}' % data["position"])

        elif data["kind"] == "get":
            all_code = []
            for dir_path in glob.glob("./bots/*/code-*"):
                print(dir_path)
                who = dir_path.split("/")[2]
                if who == "???":
                    continue
                all_code.append("\n# %s\n" % (dir_path,))
                with open(dir_path) as f:
                    all_code.append(f.read().replace("\t", "    "))
            bot_names = []
            for line in "".join(all_code).split("\n"):
                m = re.match("class ([a-zA-Z0-9]*):.*", line)
                if m:
                    bot_name, = m.groups()
                    bot_names.append(bot_name)
            print("Bot names:", bot_names)
            await websocket.send(json.dumps({
                "kind": "get",
                "base": "".join(all_code),
                "botNames": ", ".join(bot_names),
            }))

    #name = await websocket.recv()
    #print(f"< {name}")
    #greeting = f"Hello {name}!"
    #await websocket.send(greeting)
    #print(f"> {greeting}")

start_server = websockets.serve(handler, "0.0.0.0", 10100)

print("Starting.")
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
