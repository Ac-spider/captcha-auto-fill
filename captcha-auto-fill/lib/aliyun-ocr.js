/**
 * 阿里云 OCR 服务 - 使用阿里云视觉智能 OCR API
 */

class AliyunOCR {
  constructor() {
    this.apiUrl = 'https://ocr.aliyuncs.com';
    this.accessKeyId = '';
    this.accessKeySecret = '';
    this.currentImageData = null;
  }

  getCurrentImageData() {
    return this.currentImageData || null;
  }

  setAccessKey(accessKeyId) {
    this.accessKeyId = accessKeyId;
  }

  setAccessSecret(accessKeySecret) {
    this.accessKeySecret = accessKeySecret;
  }

  async recognize(imageSrc) {
    try {
      console.log('[AliyunOCR] 开始识别，输入类型:', imageSrc?.startsWith('data:image') ? 'base64' : 'URL');

      if (!this.accessKeyId || !this.accessKeySecret) {
        throw new Error('未设置阿里云 Access Key');
      }

      this.currentImageData = imageSrc;

      const base64Image = await this.getBase64Image(imageSrc);
      console.log('[AliyunOCR] 图片已转换，长度:', base64Image.length);

      const result = await this.callAliyunAPI(base64Image);
      console.log('[AliyunOCR] 识别结果:', result);

      return result;
    } catch (error) {
      console.error('[AliyunOCR] 识别失败:', error);
      return { text: '', confidence: 0 };
    }
  }

  async getBase64Image(imageSrc) {
    if (imageSrc.startsWith('data:image')) {
      const base64Match = imageSrc.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (base64Match) return base64Match[1];
      const commaIndex = imageSrc.indexOf(',');
      if (commaIndex > 0) return imageSrc.substring(commaIndex + 1);
      return imageSrc;
    }

    if (/^[A-Za-z0-9+/=]+$/.test(imageSrc)) {
      return imageSrc;
    }

    if (imageSrc.startsWith('http')) {
      throw new Error('为避免验证码刷新，请传入 base64 图片数据');
    }

    throw new Error('不支持的图片格式');
  }

  async callAliyunAPI(base64Image) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      throw new Error('Chrome runtime 不可用');
    }

    console.log('[AliyunOCR] 通过 background.js 代理请求...');

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'aliyunOcrRequest',
          accessKeyId: this.accessKeyId,
          accessKeySecret: this.accessKeySecret,
          base64Image: base64Image
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[AliyunOCR] Chrome Message 错误:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          console.log('[AliyunOCR] 收到响应:', response);

          if (!response || !response.success) {
            reject(new Error(response?.error || '阿里云 OCR 请求失败'));
            return;
          }

          resolve({
            text: response.result.text,
            confidence: response.result.confidence
          });
        }
      );
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AliyunOCR;
}
