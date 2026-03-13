#!/usr/bin/env python3
"""启动 OCR 服务"""
import subprocess
import sys

def main():
    print("正在启动 ddddocr 服务...")
    print("请确保已安装依赖: pip install -r requirements.txt")
    print("")
    subprocess.run([sys.executable, "ocr_server.py"])

if __name__ == '__main__':
    main()
