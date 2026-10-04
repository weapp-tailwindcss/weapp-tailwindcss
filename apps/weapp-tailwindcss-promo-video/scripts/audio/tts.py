"""生成同一条语音流的音频和词级时间戳，供字幕精确对齐。"""

import asyncio
import json
import pathlib
import sys

import edge_tts


async def main():
    text, target, voice, rate = sys.argv[1:]
    output = pathlib.Path(target)
    words = []
    communication = edge_tts.Communicate(
        text, voice, rate=rate, boundary="WordBoundary"
    )
    with output.open("wb") as audio:
        async for chunk in communication.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({
                    "text": chunk["text"],
                    "start": chunk["offset"] / 10_000_000,
                    "end": (chunk["offset"] + chunk["duration"]) / 10_000_000,
                })
    if not words:
        raise RuntimeError("语音服务未返回词级时间戳")
    output.with_suffix(".words.json").write_text(
        json.dumps(words, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


asyncio.run(main())
