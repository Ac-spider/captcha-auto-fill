/**
 * OpenAI OCR 服务 - 使用 GPT-4 Vision API 进行验证码识别
 */

class OpenAIOCR {
  constructor() {
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    this.apiKey = '';
    this.model = 'gpt-4o';
    this.maxTokens = 500;
    this.currentImageData = null;
  }

  /**
   * 获取当前处理的图片数据
   */
  getCurrentImageData() {
    return this.currentImageData || null;
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * 设置模型
   */
  setModel(model) {
    this.model = model;
  }

  /**
   * 识别验证码
   */
  async recognize(imageSrc) {
    try {
      console.log('[OpenAIOCR] 开始识别，输入类型:', imageSrc?.startsWith('data:image') ? 'base64' : 'URL', '长度:', imageSrc?.length || 0);

      if (!this.apiKey) {
        throw new Error('未设置 OpenAI API Key，请在设置中配置');
      }

      this.currentImageData = imageSrc;

      const base64Image = await this.getBase64Image(imageSrc);
      console.log('[OpenAIOCR] 图片已转换，长度:', base64Image.length);

      const result = await this.callOpenAIAPI(base64Image);
      console.log('[OpenAIOCR] 识别结果:', result);

      return result;
    } catch (error) {
      console.error('[OpenAIOCR] 识别失败:', error);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 获取图片 base64
   */
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

  /**
   * 调用 OpenAI API
   */
  async callOpenAIAPI(base64Image) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      throw new Error('Chrome runtime 不可用');
    }

    console.log('[OpenAIOCR] 通过 background.js 代理请求...');

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: 'openaiOcrRequest',
          apiKey: this.apiKey,
          model: this.model,
          maxTokens: this.maxTokens,
          base64Image: base64Image
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[OpenAIOCR] Chrome Message 错误:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          console.log('[OpenAIOCR] 收到响应:', response);

          if (!response || !response.success) {
            reject(new Error(response?.error || 'OpenAI API 请求失败'));
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
  module.exports = OpenAIOCR;
}
