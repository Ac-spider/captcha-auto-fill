/**
 * OCR 服务 - 使用在线 OCR API 识别验证码
 */

class OCRService {
  constructor() {
    this.apiUrl = 'https://api.ocr.space/parse/image';
    // 免费 API key (有使用限制)
    this.apiKey = 'K88989508888957';
    this.currentImageData = null; // 保存当前处理的图片数据
  }

  /**
   * 识别验证码
   * @param {string} imageSrc - 图片 URL 或 base64
   * @returns {Promise<{text: string, confidence: number}>}
   */
  async recognize(imageSrc) {
    try {
      console.log('[OCRService] 开始识别，输入:', imageSrc.substring(0, 100));

      // 保存原始图片数据用于后续下载
      this.currentImageData = imageSrc;

      // 如果已经是 base64，直接使用
      let imageData = imageSrc;
      if (!imageSrc.startsWith('data:image')) {
        // 尝试转换为 base64
        try {
          imageData = await this.getBase64Image(imageSrc);
        } catch (e) {
          console.warn('[OCRService] 转换 base64 失败，尝试使用 URL:', e);
        }
      }

      const isBase64 = imageData.startsWith('data:image');
      console.log('[OCRService] 转换后类型:', isBase64 ? 'base64' : 'URL');

      // 优先使用 base64 方式调用 API
      if (isBase64) {
        console.log('[OCRService] 使用 base64 方式调用');
        const result = await this.callOCRAPI(imageData);
        console.log('[OCRService] base64 方式结果:', result);
        return result;
      }

      // 如果还是 URL，尝试 URL 方式
      console.log('[OCRService] 使用 URL 方式调用');
      const result = await this.callOCRAPIWithURL(imageData);
      console.log('[OCRService] URL 方式结果:', result);
      return result;
    } catch (error) {
      console.error('[OCRService] 识别失败:', error);
      // 失败时返回空结果
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 使用 URL 调用 OCR API
   */
  async callOCRAPIWithURL(imageUrl) {
    console.log('[OCRService] 使用 URL 方式:', imageUrl);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        apikey: this.apiKey,
        url: imageUrl,
        language: 'eng',
        isOverlayRequired: 'false',
        detectOrientation: 'false',
        scale: 'true',
        OCREngine: '2',
        filetype: 'png'
      })
    });

    const data = await response.json();
    console.log('[OCRService] API 响应:', data);

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage || 'OCR 处理错误');
    }

    if (data.ParsedResults && data.ParsedResults.length > 0) {
      const result = data.ParsedResults[0];
      const text = result.ParsedText.trim().replace(/\s/g, '');

      return {
        text: text,
        confidence: text.length > 0 ? 90 : 0
      };
    }

    return { text: '', confidence: 0 };
  }

  /**
   * 获取图片的 base64 编码
   * 注意：不再重新加载图片，避免验证码刷新
   */
  async getBase64Image(imageSrc) {
    // 如果已经是 base64，直接使用
    if (imageSrc.startsWith('data:image')) {
      return imageSrc;
    }

    // 对于 HTTP URL，不再尝试重新加载图片（会导致验证码刷新）
    // 直接返回 URL，让 API 使用 URL 方式
    console.log('[OCRService] 传入的是 URL，使用 URL 方式调用 API（避免重新加载导致刷新）');
    return imageSrc;
  }

  /**
   * 获取当前处理的图片数据（用于下载）
   * @returns {string|null} - 当前图片的 base64 或 URL
   */
  getCurrentImageData() {
    return this.currentImageData || null;
  }

  /**
   * 将图片转换为 base64
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
          resolve(base64);
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
   * 调用 OCR API
   */
  async callOCRAPI(base64Image) {
    // 确保 base64 有正确的格式
    let formattedBase64 = base64Image;
    if (!base64Image.startsWith('data:image')) {
      formattedBase64 = 'data:image/png;base64,' + base64Image;
    }

    console.log('[OCRService] 发送请求，base64 长度:', formattedBase64.length);

    // 使用 fetch 发送请求
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        apikey: this.apiKey,
        base64Image: formattedBase64,
        language: 'eng',
        isOverlayRequired: 'false',
        filetype: 'png',
        detectOrientation: 'false',
        scale: 'true',
        OCREngine: '2' // 使用引擎2，更适合验证码
      })
    });

    const data = await response.json();
    console.log('[OCRService] API 响应:', data);

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage || 'OCR 处理错误');
    }

    if (data.ParsedResults && data.ParsedResults.length > 0) {
      const result = data.ParsedResults[0];
      console.log('[OCRService] ParsedResult:', result);

      const text = result.ParsedText ? result.ParsedText.trim().replace(/\s/g, '') : '';
      console.log('[OCRService] 识别文本:', text);

      // 计算置信度
      let confidence = 80; // 默认置信度
      if (result.TextOverlay && result.TextOverlay.Lines && result.TextOverlay.Lines.length > 0 && text.length > 0) {
        const totalWordLength = result.TextOverlay.Lines[0].Words.reduce((sum, word) => sum + (word.WordText ? word.WordText.length : 0), 0);
        confidence = totalWordLength / text.length * 100;
      }

      return {
        text: text,
        confidence: Math.min(100, confidence)
      };
    }

    console.warn('[OCRService] API 返回了空结果');
    return { text: '', confidence: 0 };
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OCRService;
}
