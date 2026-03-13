/**
 * 百度 OCR API 服务
 * 需要用户自行申请 API Key 和 Secret Key
 * 申请地址：https://ai.baidu.com/tech/ocr/general
 */

class BaiduOCR {
  constructor() {
    // 这里需要用户填写自己的 API Key 和 Secret Key
    // 可以从 https://ai.baidu.com/tech/ocr/general 免费申请
    this.apiKey = '';
    this.secretKey = '';
    this.accessToken = null;
    this.tokenExpireTime = 0;
  }

  /**
   * 设置 API Key 和 Secret Key
   */
  setCredentials(apiKey, secretKey) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.accessToken = null;
    this.tokenExpireTime = 0;
  }

  /**
   * 获取 Access Token
   */
  async getAccessToken() {
    // 如果 token 还没过期，直接返回
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    if (!this.apiKey || !this.secretKey) {
      throw new Error('请先设置 API Key 和 Secret Key');
    }

    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.secretKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error_description || '获取 Access Token 失败');
    }

    this.accessToken = data.access_token;
    // token 提前 10 分钟过期
    this.tokenExpireTime = Date.now() + (data.expires_in - 600) * 1000;

    return this.accessToken;
  }

  /**
   * 识别验证码
   */
  async recognize(imageSrc) {
    try {
      // 获取 access token
      const token = await this.getAccessToken();

      // 将图片转换为 base64
      const base64Image = await this.getBase64Image(imageSrc);

      // 调用百度 OCR API
      const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          image: base64Image.replace(/^data:image\/\w+;base64,/, ''),
          language_type: 'ENG',
          detect_direction: 'false',
          detect_language: 'false',
          probability: 'false'
        })
      });

      const data = await response.json();
      console.log('[BaiduOCR] API 响应:', data);

      if (data.error_code) {
        throw new Error(data.error_msg || 'OCR 识别失败');
      }

      if (data.words_result && data.words_result.length > 0) {
        const text = data.words_result.map(r => r.words).join('').replace(/\s/g, '');
        return {
          text: text,
          confidence: data.words_result[0].probability ?
            data.words_result[0].probability.average * 100 : 80
        };
      }

      return { text: '', confidence: 0 };
    } catch (error) {
      console.error('[BaiduOCR] 识别失败:', error);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 将图片转换为 base64
   */
  getBase64Image(imageSrc) {
    return new Promise((resolve, reject) => {
      if (imageSrc.startsWith('data:image')) {
        resolve(imageSrc);
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/png');
          resolve(base64);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('图片加载失败'));
      };

      img.src = imageSrc;
    });
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaiduOCR;
}
