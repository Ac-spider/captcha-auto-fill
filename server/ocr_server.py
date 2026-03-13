from flask import Flask, request, jsonify
import ddddocr
import base64
from io import BytesIO
from PIL import Image

app = Flask(__name__)

# 初始化 OCR（只识别小写字母）
ocr = ddddocr.DdddOcr()
ocr.set_ranges('abcdefghijklmnopqrstuvwxyz')  # 只识别小写字母 a-z


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

    data = request.json
    image_base64 = data.get('image', '')

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


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)
