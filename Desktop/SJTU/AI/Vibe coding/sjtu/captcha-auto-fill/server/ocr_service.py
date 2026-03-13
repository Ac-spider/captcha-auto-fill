"""
OCR 服务 - Windows 服务版本
适配 nssm 作为 Windows 服务运行
"""
from flask import Flask, request, jsonify
import ddddocr
import base64
from io import BytesIO
from PIL import Image
import sys
import os

# 确保工作目录正确（对于服务很重要）
if getattr(sys, 'frozen', False):
    # 如果是打包后的 exe
    application_path = os.path.dirname(sys.executable)
else:
    # 如果是脚本运行
    application_path = os.path.dirname(os.path.abspath(__file__))

os.chdir(application_path)

app = Flask(__name__)

# 初始化 OCR（只识别小写字母）
try:
    ocr = ddddocr.DdddOcr()
    ocr.set_ranges('abcdefghijklmnopqrstuvwxyz')  # 只识别小写字母 a-z
    print("[OCR Service] OCR 引擎初始化成功")
except Exception as e:
    print(f"[OCR Service] OCR 引擎初始化失败: {e}")
    raise


@app.after_request
def after_request(response):
    """添加 CORS 头，允许浏览器插件访问"""
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response


@app.route('/ocr', methods=['POST', 'OPTIONS'])
def ocr_endpoint():
    # 处理预检请求
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})

    try:
        data = request.json
        image_base64 = data.get('image', '')

        if not image_base64:
            return jsonify({'error': 'No image provided'}), 400

        # 解码 base64 图片
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]

        image_bytes = base64.b64decode(image_base64)

        # 使用 ddddocr 识别
        result = ocr.classification(image_bytes)

        return jsonify({
            'text': result,
            'confidence': 95  # ddddocr 不返回置信度，设为固定高值
        })
    except Exception as e:
        print(f"[OCR Service] 识别错误: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({'status': 'ok', 'service': 'ocr-captcha'})


if __name__ == '__main__':
    print("[OCR Service] 启动中...")
    print("[OCR Service] 监听地址: http://127.0.0.1:5000")
    # 使用 threaded=True 支持多线程
    app.run(host='127.0.0.1', port=5000, threaded=True)
