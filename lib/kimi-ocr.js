/**
 * Kimi OCR 服务 - 使用 Moonshot AI API 进行验证码识别
 */

class KimiOCR {
  constructor() {
    this.apiUrl = 'https://api.moonshot.cn/v1/chat/completions';
    this.apiKey = '';
    this.model = 'kimi-k2.5';
    this.maxTokens = 500;
    this.currentImageData = null; // 保存当前处理的图片数据
  }

  /**
   * 获取当前处理的图片数据（用于下载）
   * @returns {string|null} - 当前图片的 base64 或 URL
   */
  getCurrentImageData() {
    return this.currentImageData || null;
  }

  /**
   * 设置 API Key
   * @param {string} apiKey - Moonshot API Key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * 识别验证码
   * @param {string} imageSrc - 图片 URL 或 base64
   * @returns {Promise<{text: string, confidence: number}>}
   */
  async recognize(imageSrc) {
    try {
      console.log('[KimiOCR] 开始识别验证码，输入类型:', imageSrc?.startsWith('data:image') ? 'base64' : 'URL', '长度:', imageSrc?.length || 0);

      if (!this.apiKey) {
        throw new Error('未设置 Kimi API Key，请在设置中配置');
      }

      // 保存原始图片数据用于后续下载
      this.currentImageData = imageSrc;

      // 将图片转换为 base64
      const base64Image = await this.getBase64Image(imageSrc);
      console.log('[KimiOCR] 图片已转换为 base64，长度:', base64Image.length, '前50字符:', base64Image.substring(0, 50));

      // 调用 Kimi API
      const result = await this.callKimiAPI(base64Image);
      console.log('[KimiOCR] 识别结果:', result);

      return result;
    } catch (error) {
      console.error('[KimiOCR] 识别失败:', error);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 获取图片的 base64 编码
   * @param {string} imageSrc - 图片 URL 或 base64
   * @returns {Promise<string>} - base64 编码（不含 data URI 前缀）
   */
  async getBase64Image(imageSrc) {
    // 如果已经是 base64 data URL
    if (imageSrc.startsWith('data:image')) {
      // 提取纯 base64 部分
      const base64Match = imageSrc.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (base64Match) {
        console.log('[KimiOCR] 从 data URL 提取 base64，长度:', base64Match[1].length);
        return base64Match[1];
      }
      // 如果匹配失败，尝试直接去掉前缀
      console.warn('[KimiOCR] base64 正则匹配失败，尝试直接处理');
      const commaIndex = imageSrc.indexOf(',');
      if (commaIndex > 0) {
        return imageSrc.substring(commaIndex + 1);
      }
      return imageSrc;
    }

    // 如果已经是纯 base64（没有 data: 前缀）
    if (/^[A-Za-z0-9+/=]+$/.test(imageSrc)) {
      console.log('[KimiOCR] 检测到纯 base64 字符串，长度:', imageSrc.length);
      return imageSrc;
    }

    // 对于 HTTP URL，不再重新加载图片（会导致验证码刷新）
    // 抛出错误，让调用方使用其他方式
    if (imageSrc.startsWith('http')) {
      console.error('[KimiOCR] 传入的是 URL，为避免验证码刷新，请传入 base64 数据');
      throw new Error('为避免验证码刷新，Kimi OCR 需要传入 base64 图片数据而非 URL');
    }

    throw new Error('不支持的图片格式: ' + imageSrc.substring(0, 50));
  }

  /**
   * 将图片转换为 base64
   * @param {string} imageUrl - 图片 URL
   * @returns {Promise<string>} - base64 编码（不含 data URI 前缀）
   */
  convertImageToBase64(imageUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          // 填充白色背景
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/png');
          // 提取纯 base64 部分
          const base64Match = base64.match(/^data:image\/[^;]+;base64,(.+)$/);
          if (base64Match) {
            resolve(base64Match[1]);
          } else {
            reject(new Error('base64 转换失败'));
          }
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('图片加载失败'));
      };

      // 添加时间戳避免缓存
      const url = imageUrl + (imageUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
      img.src = url;
    });
  }

  /**
   * 调用 Kimi API
   * @param {string} base64Image - base64 编码的图片（不含 data URI 前缀）
   * @returns {Promise<{text: string, confidence: number}>}
   */
  async callKimiAPI(base64Image) {
    // 检查 chrome.runtime 是否可用
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      throw new Error('Chrome runtime 不可用');
    }

    console.log('[KimiOCR] 通过 background.js 代理请求 Kimi API...');

    // 通过 Chrome Message API 发送给 background.js 代理请求
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'kimiOcrRequest',
          apiKey: this.apiKey,
          model: this.model,
          maxTokens: this.maxTokens,
          base64Image: base64Image
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[KimiOCR] Chrome Message 错误:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          console.log('[KimiOCR] 收到 background.js 响应:', response);

          if (!response || !response.success) {
            reject(new Error(response?.error || 'Kimi API 请求失败'));
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

  /**
   * 直接调用 Kimi API（用于测试，需要处理 CORS）
   * @param {string} base64Image - base64 编码的图片（不含 data URI 前缀）
   * @returns {Promise<{text: string, confidence: number}>}
   */
  async callKimiAPIDirectly(base64Image) {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            },
            {
              type: 'text',
              text: '识别图片中的验证码文字，只返回文字内容，不要任何解释。验证码通常由4-6位小写字母组成。'
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('[KimiOCR] API 响应:', data);

    if (data.choices && data.choices.length > 0) {
      const text = data.choices[0].message.content.trim();
      // 清理结果，只保留字母数字
      const cleanedText = text.replace(/[^a-zA-Z0-9]/g, '');

      return {
        text: cleanedText,
        confidence: cleanedText.length > 0 ? 95 : 0
      };
    }

    return { text: '', confidence: 0 };
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KimiOCR;
}
