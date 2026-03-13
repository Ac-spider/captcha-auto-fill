/**
 * 验证码识别器
 * 支持多种识别引擎：本地 ddddocr 服务、Kimi API、在线 OCR、本地算法
 */

class CaptchaRecognizer {
  constructor() {
    // 字符集
    this.chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // 字符特征库 - 每个字符的典型特征
    this.charFeatures = new Map();
    this.initialized = false;
    this.apiUrl = 'http://127.0.0.1:5000/ocr';
    this.useLocalOcr = true; // 优先使用本地 OCR 服务

    // 识别引擎设置
    this.engine = 'local'; // local, kimi, online, algorithm
    this.kimiOcr = null;   // Kimi OCR 服务实例
    this.ocrService = null; // 在线 OCR 服务实例

    // 加载设置
    this.loadSettings();
  }

  /**
   * 加载用户设置
   */
  async loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const settings = await chrome.storage.sync.get([
        'recognitionEngine',
        'kimiApiKey',
        'openaiApiKey',
        'claudeApiKey',
        'geminiApiKey',
        'baiduApiKey',
        'baiduSecretKey',
        'aliyunAccessKey',
        'aliyunAccessSecret',
        'selectedModel'
      ]);

      if (settings.recognitionEngine) {
        this.engine = settings.recognitionEngine;
      }

      // 初始化对应的 OCR 服务
      this.initOcrService(this.engine, settings);
    }
  }

  /**
   * 初始化 OCR 服务
   */
  initOcrService(engine, settings) {
    switch (engine) {
      case 'kimi':
        if (settings.kimiApiKey) this.initKimiOcr(settings.kimiApiKey, settings.selectedModel);
        break;
      case 'openai':
        if (settings.openaiApiKey) this.initOpenAIOcr(settings.openaiApiKey, settings.selectedModel);
        break;
      case 'claude':
        if (settings.claudeApiKey) this.initClaudeOcr(settings.claudeApiKey, settings.selectedModel);
        break;
      case 'gemini':
        if (settings.geminiApiKey) this.initGeminiOcr(settings.geminiApiKey, settings.selectedModel);
        break;
      case 'baidu':
        if (settings.baiduApiKey && settings.baiduSecretKey) {
          this.initBaiduOcr(settings.baiduApiKey, settings.baiduSecretKey);
        }
        break;
      case 'aliyun':
        if (settings.aliyunAccessKey && settings.aliyunAccessSecret) {
          this.initAliyunOcr(settings.aliyunAccessKey, settings.aliyunAccessSecret);
        }
        break;
      case 'online':
        this.initOnlineOcr();
        break;
    }
  }

  /**
   * 初始化 Kimi OCR 服务
   */
  initKimiOcr(apiKey, model = null) {
    if (typeof KimiOCR !== 'undefined') {
      this.kimiOcr = new KimiOCR();
      this.kimiOcr.setApiKey(apiKey);
      if (model) this.kimiOcr.setModel(model);
    } else {
      console.warn('[CaptchaRecognizer] KimiOCR 类未加载');
    }
  }

  /**
   * 初始化 OpenAI OCR 服务
   */
  initOpenAIOcr(apiKey, model = null) {
    if (typeof OpenAIOCR !== 'undefined') {
      this.openaiOcr = new OpenAIOCR();
      this.openaiOcr.setApiKey(apiKey);
      if (model) this.openaiOcr.setModel(model);
    } else {
      console.warn('[CaptchaRecognizer] OpenAIOCR 类未加载');
    }
  }

  /**
   * 初始化 Claude OCR 服务
   */
  initClaudeOcr(apiKey, model = null) {
    if (typeof ClaudeOCR !== 'undefined') {
      this.claudeOcr = new ClaudeOCR();
      this.claudeOcr.setApiKey(apiKey);
      if (model) this.claudeOcr.setModel(model);
    } else {
      console.warn('[CaptchaRecognizer] ClaudeOCR 类未加载');
    }
  }

  /**
   * 初始化 Gemini OCR 服务
   */
  initGeminiOcr(apiKey, model = null) {
    if (typeof GeminiOCR !== 'undefined') {
      this.geminiOcr = new GeminiOCR();
      this.geminiOcr.setApiKey(apiKey);
      if (model) this.geminiOcr.setModel(model);
    } else {
      console.warn('[CaptchaRecognizer] GeminiOCR 类未加载');
    }
  }

  /**
   * 初始化百度 OCR 服务
   */
  initBaiduOcr(apiKey, secretKey) {
    if (typeof BaiduOCR !== 'undefined') {
      this.baiduOcr = new BaiduOCR();
      this.baiduOcr.setApiKey(apiKey);
      this.baiduOcr.setSecretKey(secretKey);
    } else {
      console.warn('[CaptchaRecognizer] BaiduOCR 类未加载');
    }
  }

  /**
   * 初始化阿里云 OCR 服务
   */
  initAliyunOcr(accessKey, accessSecret) {
    if (typeof AliyunOCR !== 'undefined') {
      this.aliyunOcr = new AliyunOCR();
      this.aliyunOcr.setAccessKey(accessKey);
      this.aliyunOcr.setAccessSecret(accessSecret);
    } else {
      console.warn('[CaptchaRecognizer] AliyunOCR 类未加载');
    }
  }

  /**
   * 初始化在线 OCR 服务
   */
  initOnlineOcr() {
    // 动态加载 OCRService 类（如果可用）
    if (typeof OCRService !== 'undefined') {
      this.ocrService = new OCRService();
    } else {
      console.warn('[CaptchaRecognizer] OCRService 类未加载');
    }
  }

  /**
   * 设置识别引擎
   * @param {string} engine - 引擎类型: local, kimi, openai, claude, gemini, baidu, aliyun, online
   * @param {Object} config - 配置对象
   */
  async setEngine(engine, config = {}) {
    this.engine = engine;
    console.log('[CaptchaRecognizer] 设置识别引擎:', engine);

    switch (engine) {
      case 'kimi':
        if (config.apiKey) this.initKimiOcr(config.apiKey, config.model);
        break;
      case 'openai':
        if (config.apiKey) this.initOpenAIOcr(config.apiKey, config.model);
        break;
      case 'claude':
        if (config.apiKey) this.initClaudeOcr(config.apiKey, config.model);
        break;
      case 'gemini':
        if (config.apiKey) this.initGeminiOcr(config.apiKey, config.model);
        break;
      case 'baidu':
        if (config.apiKey && config.secretKey) {
          this.initBaiduOcr(config.apiKey, config.secretKey);
        }
        break;
      case 'aliyun':
        if (config.accessKey && config.accessSecret) {
          this.initAliyunOcr(config.accessKey, config.accessSecret);
        }
        break;
      case 'online':
        this.initOnlineOcr();
        break;
    }
  }

  async init() {
    if (this.initialized) return;
    await this.buildCharFeatures();
    this.initialized = true;
  }

  /**
   * 构建字符特征库（用于 fallback）
   */
  async buildCharFeatures() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = 16;
    canvas.height = 24;

    for (const char of this.chars) {
      // 清空画布
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 16, 24);

      // 绘制字符
      ctx.fillStyle = 'black';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char, 8, 12);

      // 提取特征
      const imageData = ctx.getImageData(0, 0, 16, 24);
      const features = this.extractFeatures(imageData);
      this.charFeatures.set(char, features);
    }
  }

  /**
   * 提取图像特征（用于 fallback）
   */
  extractFeatures(imageData) {
    const { data, width, height } = imageData;
    const features = [];

    // 将图像分成 4x4 的网格，计算每个网格的平均灰度
    const gridSize = 4;
    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let sum = 0;
        let count = 0;

        for (let y = Math.floor(gy * cellHeight); y < Math.floor((gy + 1) * cellHeight); y++) {
          for (let x = Math.floor(gx * cellWidth); x < Math.floor((gx + 1) * cellWidth); x++) {
            const idx = (y * width + x) * 4;
            const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            sum += gray < 128 ? 1 : 0; // 二值化
            count++;
          }
        }

        features.push(count > 0 ? sum / count : 0);
      }
    }

    // 添加垂直投影特征
    for (let x = 0; x < width; x += 2) {
      let sum = 0;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        sum += gray < 128 ? 1 : 0;
      }
      features.push(sum / height);
    }

    // 添加水平投影特征
    for (let y = 0; y < height; y += 2) {
      let sum = 0;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        sum += gray < 128 ? 1 : 0;
      }
      features.push(sum / width);
    }

    return features;
  }

  /**
   * 识别验证码
   * 根据用户选择的引擎进行识别
   */
  async recognize(imageSrc) {
    // 提取图片标识用于日志（取前50个字符）
    const imageId = imageSrc?.substring(0, 50) + '...' || 'unknown';
    const isBase64 = imageSrc?.startsWith('data:image');
    console.log('[CaptchaRecognizer] 开始识别，引擎:', this.engine, '图片类型:', isBase64 ? 'base64' : 'URL', '长度:', imageSrc?.length || 0);

    let result;
    let imageDataForDownload = imageSrc; // 用于下载的图片数据

    switch (this.engine) {
      case 'kimi':
        result = await this.recognizeWithKimi(imageSrc, imageId);
        if (this.kimiOcr && this.kimiOcr.getCurrentImageData()) {
          imageDataForDownload = this.kimiOcr.getCurrentImageData();
        }
        break;

      case 'openai':
        result = await this.recognizeWithOpenAI(imageSrc, imageId);
        if (this.openaiOcr && this.openaiOcr.getCurrentImageData()) {
          imageDataForDownload = this.openaiOcr.getCurrentImageData();
        }
        break;

      case 'claude':
        result = await this.recognizeWithClaude(imageSrc, imageId);
        if (this.claudeOcr && this.claudeOcr.getCurrentImageData()) {
          imageDataForDownload = this.claudeOcr.getCurrentImageData();
        }
        break;

      case 'gemini':
        result = await this.recognizeWithGemini(imageSrc, imageId);
        if (this.geminiOcr && this.geminiOcr.getCurrentImageData()) {
          imageDataForDownload = this.geminiOcr.getCurrentImageData();
        }
        break;

      case 'baidu':
        result = await this.recognizeWithBaidu(imageSrc, imageId);
        if (this.baiduOcr && this.baiduOcr.getCurrentImageData()) {
          imageDataForDownload = this.baiduOcr.getCurrentImageData();
        }
        break;

      case 'aliyun':
        result = await this.recognizeWithAliyun(imageSrc, imageId);
        if (this.aliyunOcr && this.aliyunOcr.getCurrentImageData()) {
          imageDataForDownload = this.aliyunOcr.getCurrentImageData();
        }
        break;

      case 'online':
        result = await this.recognizeWithOnlineOcr(imageSrc, imageId);
        if (this.ocrService && this.ocrService.getCurrentImageData()) {
          imageDataForDownload = this.ocrService.getCurrentImageData();
        }
        if (!isBase64 && imageDataForDownload === imageSrc) {
          try {
            imageDataForDownload = await this.fetchImageAsBase64(imageSrc);
          } catch (e) {
            console.warn('[CaptchaRecognizer] 获取在线 OCR 图片失败:', e);
            imageDataForDownload = imageSrc;
          }
        }
        break;

      case 'local':
      default:
        result = await this.recognizeWithLocal(imageSrc, imageId);
        break;
    }

    // 下载图片用于比对（已禁用）
    // if (result && result.text) {
    //   this.downloadImageForComparison(imageDataForDownload, imageSrc, this.engine);
    // }

    return result;
  }

  /**
   * 下载图片用于比对 - 已禁用
   * 通过发送消息给 background script 来下载图片
   */
  // eslint-disable-next-line no-unused-vars
  downloadImageForComparison(imageData, originalSrc, engine) {
    // 下载功能已禁用
    console.log('[CaptchaRecognizer] 下载图片功能已禁用');
    return;

    // 以下是原来的代码，已禁用
    /*
    try {
      // 检查是否在浏览器环境中
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        console.warn('[CaptchaRecognizer] Chrome runtime 不可用，无法下载图片');
        return;
      }

      // 发送消息给 background script 下载图片
      chrome.runtime.sendMessage({
        action: 'downloadCaptchaForComparison',
        image: imageData,
        originalUrl: originalSrc,
        engine: engine
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[CaptchaRecognizer] 下载图片消息发送失败:', chrome.runtime.lastError);
        } else {
          console.log(`[CaptchaRecognizer] 图片下载请求已发送 [${engine}]:`, response);
        }
      });
    } catch (error) {
      console.warn('[CaptchaRecognizer] 下载图片失败:', error);
    }
    */
  }

  /**
   * 获取图片并转换为 base64
   * 用于在线 OCR 下载原始图片
   */
  async fetchImageAsBase64(imageUrl) {
    return new Promise((resolve, reject) => {
      // 通过 background script 获取图片
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error('Chrome runtime 不可用'));
        return;
      }

      chrome.runtime.sendMessage(
        { action: 'fetchImageAsBase64', imageUrl: imageUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (response && response.success) {
            resolve(response.base64);
          } else {
            reject(new Error(response?.error || '获取图片失败'));
          }
        }
      );
    });
  }

  /**
   * 使用本地 ddddocr 服务识别
   */
  async recognizeWithLocal(imageSrc, imageId) {
    try {
      const result = await this.recognizeWithLocalOcr(imageSrc);
      console.log('[CaptchaRecognizer] ✅ 本地 OCR 服务识别结果:', result, '图片:', imageId);
      return result;
    } catch (error) {
      console.warn('[CaptchaRecognizer] ⚠️ 本地 OCR 服务调用失败，回退到本地算法:', error.message, '图片:', imageId);
      return await this.recognizeWithAlgorithm(imageSrc, imageId);
    }
  }

  /**
   * 使用 Kimi API 识别
   */
  async recognizeWithKimi(imageSrc, imageId) {
    try {
      if (!this.kimiOcr) {
        throw new Error('Kimi OCR 服务未初始化，请先设置 API Key');
      }

      console.log('[CaptchaRecognizer] 使用 Kimi API 识别...');
      const result = await this.kimiOcr.recognize(imageSrc);

      if (result.text) {
        console.log('[CaptchaRecognizer] ✅ Kimi API 识别结果:', result, '图片:', imageId);
        return result;
      } else {
        throw new Error('Kimi API 识别失败');
      }
    } catch (error) {
      console.warn('[CaptchaRecognizer] ⚠️ Kimi API 识别失败:', error.message, '图片:', imageId);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 使用 OpenAI API 识别
   */
  async recognizeWithOpenAI(imageSrc, imageId) {
    try {
      if (!this.openaiOcr) {
        throw new Error('OpenAI OCR 服务未初始化，请先设置 API Key');
      }

      console.log('[CaptchaRecognizer] 使用 OpenAI API 识别...');
      const result = await this.openaiOcr.recognize(imageSrc);

      if (result.text) {
        console.log('[CaptchaRecognizer] ✅ OpenAI API 识别结果:', result, '图片:', imageId);
        return result;
      } else {
        throw new Error('OpenAI API 识别失败');
      }
    } catch (error) {
      console.warn('[CaptchaRecognizer] ⚠️ OpenAI API 识别失败:', error.message, '图片:', imageId);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 使用 Claude API 识别
   */
  async recognizeWithClaude(imageSrc, imageId) {
    try {
      if (!this.claudeOcr) {
        throw new Error('Claude OCR 服务未初始化，请先设置 API Key');
      }

      console.log('[CaptchaRecognizer] 使用 Claude API 识别...');
      const result = await this.claudeOcr.recognize(imageSrc);

      if (result.text) {
        console.log('[CaptchaRecognizer] ✅ Claude API 识别结果:', result, '图片:', imageId);
        return result;
      } else {
        throw new Error('Claude API 识别失败');
      }
    } catch (error) {
      console.warn('[CaptchaRecognizer] ⚠️ Claude API 识别失败:', error.message, '图片:', imageId);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 使用 Gemini API 识别
   */
  async recognizeWithGemini(imageSrc, imageId) {
    try {
      if (!this.geminiOcr) {
        throw new Error('Gemini OCR 服务未初始化，请先设置 API Key');
      }

      console.log('[CaptchaRecognizer] 使用 Gemini API 识别...');
      const result = await this.geminiOcr.recognize(imageSrc);

      if (result.text) {
        console.log('[CaptchaRecognizer] ✅ Gemini API 识别结果:', result, '图片:', imageId);
        return result;
      } else {
        throw new Error('Gemini API 识别失败');
      }
    } catch (error) {
      console.warn('[CaptchaRecognizer] ⚠️ Gemini API 识别失败:', error.message, '图片:', imageId);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 使用百度 OCR 识别
   */
  async recognizeWithBaidu(imageSrc, imageId) {
    try {
      if (!this.baiduOcr) {
        throw new Error('百度 OCR 服务未初始化，请先设置 API Key');
      }

      console.log('[CaptchaRecognizer] 使用百度 OCR 识别...');
      const result = await this.baiduOcr.recognize(imageSrc);

      if (result.text) {
        console.log('[CaptchaRecognizer] ✅ 百度 OCR 识别结果:', result, '图片:', imageId);
        return result;
      } else {
        throw new Error('百度 OCR 识别失败');
      }
    } catch (error) {
      console.warn('[CaptchaRecognizer] ⚠️ 百度 OCR 识别失败:', error.message, '图片:', imageId);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 使用阿里云 OCR 识别
   */
  async recognizeWithAliyun(imageSrc, imageId) {
    try {
      if (!this.aliyunOcr) {
        throw new Error('阿里云 OCR 服务未初始化，请先设置 Access Key');
      }

      console.log('[CaptchaRecognizer] 使用阿里云 OCR 识别...');
      const result = await this.aliyunOcr.recognize(imageSrc);

      if (result.text) {
        console.log('[CaptchaRecognizer] ✅ 阿里云 OCR 识别结果:', result, '图片:', imageId);
        return result;
      } else {
        throw new Error('阿里云 OCR 识别失败');
      }
    } catch (error) {
      console.warn('[CaptchaRecognizer] ⚠️ 阿里云 OCR 识别失败:', error.message, '图片:', imageId);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 使用在线 OCR 服务识别
   */
  async recognizeWithOnlineOcr(imageSrc, imageId) {
    try {
      if (!this.ocrService) {
        this.initOnlineOcr();
      }

      if (!this.ocrService) {
        throw new Error('在线 OCR 服务未初始化');
      }

      console.log('[CaptchaRecognizer] 使用在线 OCR 识别...');
      const result = await this.ocrService.recognize(imageSrc);

      // 检查结果是否有效（文本非空且置信度大于0）
      if (result.text && result.text.length > 0 && result.confidence > 0) {
        console.log('[CaptchaRecognizer] ✅ 在线 OCR 识别结果:', result, '图片:', imageId);
        return result;
      } else {
        console.warn('[CaptchaRecognizer] ⚠️ 在线 OCR 返回空结果，尝试回退');
        throw new Error('在线 OCR 识别结果为空');
      }
    } catch (error) {
      console.warn('[CaptchaRecognizer] ⚠️ 在线 OCR 识别失败:', error.message, '图片:', imageId);
      // 回退到本地算法
      return await this.recognizeWithAlgorithm(imageSrc, imageId);
    }
  }

  /**
   * 使用本地算法识别
   */
  async recognizeWithAlgorithm(imageSrc, imageId) {
    console.log('[CaptchaRecognizer] 使用本地 JavaScript 算法识别...');
    await this.init();
    const result = await this.recognizeWithLocalAlgorithm(imageSrc);
    console.log('[CaptchaRecognizer] 本地算法识别结果:', result, '图片:', imageId);
    return result;
  }

  /**
   * 使用本地 ddddocr 服务识别
   * 通过 background.js 代理请求，解决 HTTPS 页面无法访问 HTTP 和 CORS 的问题
   */
  async recognizeWithLocalOcr(imageSrc) {
    console.log('[CaptchaRecognizer] 开始本地 OCR 识别');

    // 检查 chrome.runtime 是否可用
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      throw new Error('Chrome runtime 不可用');
    }

    // 直接发送图片 URL 或 base64 给 background.js
    // background.js 会处理 URL 的图片获取（解决 CORS 问题）
    console.log('[CaptchaRecognizer] 发送请求到 background.js，类型:', imageSrc.startsWith('data:') ? 'base64' : 'URL');

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'ocrRequest', image: imageSrc },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[CaptchaRecognizer] Chrome Message 错误:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          console.log('[CaptchaRecognizer] 收到 background.js 响应:', response);

          if (!response || !response.success) {
            reject(new Error(response?.error || 'OCR 请求失败'));
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
   * 将图片转换为 base64
   * ⚠️ 警告：此方法会重新加载图片，对于验证码会导致刷新！
   * 仅用于非验证码图片，验证码识别请使用 content.js 中的 getImageData
   */
  async convertToBase64(imageSrc) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = imageSrc;
    });
  }

  /**
   * 使用本地算法识别（fallback）
   * 注意：为避免验证码刷新，只接受 base64 数据，不接受 URL
   */
  async recognizeWithLocalAlgorithm(imageSrc) {
    // 检查是否是 base64 数据
    if (!imageSrc.startsWith('data:')) {
      return Promise.reject(new Error('本地算法需要 base64 图片数据，传入的是 URL 会导致验证码刷新'));
    }

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          console.log('[CaptchaRecognizer] 本地算法图片加载成功，尺寸:', img.width, 'x', img.height);
          const result = this.processImage(img);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('图片加载失败: ' + imageSrc.substring(0, 50)));
      };

      img.src = imageSrc;
    });
  }

  /**
   * 处理图像（本地算法）
   */
  processImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // 保持原始图片尺寸，避免变形
    // 如果图片太大，按比例缩小到最大 200x80
    const maxWidth = 200;
    const maxHeight = 80;
    let width = img.width;
    let height = img.height;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;

    console.log('[CaptchaRecognizer] 处理图片，原始尺寸:', img.width, 'x', img.height, '处理后:', width, 'x', height);

    // 绘制并预处理
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // 二值化
    const binary = this.binarize(imageData);

    // 分割字符
    const charRegions = this.segmentChars(binary, canvas.width, canvas.height);

    // 识别每个字符
    let result = '';
    let totalConfidence = 0;

    for (const region of charRegions) {
      const charImg = this.extractCharImage(binary, region, canvas.width, canvas.height);
      const { char, confidence } = this.recognizeChar(charImg);
      result += char;
      totalConfidence += confidence;
    }

    const avgConfidence = charRegions.length > 0 ? totalConfidence / charRegions.length : 0;

    return {
      text: result,
      confidence: avgConfidence
    };
  }

  /**
   * 二值化图像
   */
  binarize(imageData) {
    const { data, width, height } = imageData;
    const binary = new Array(width * height);

    // 计算平均亮度
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (width * height);
    const threshold = avgBrightness * 0.7; // 自适应阈值

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        binary[y * width + x] = brightness < threshold ? 1 : 0;
      }
    }

    return binary;
  }

  /**
   * 分割字符
   */
  segmentChars(binary, width, height) {
    // 垂直投影
    const projection = new Array(width).fill(0);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (binary[y * width + x] === 1) {
          projection[x]++;
        }
      }
    }

    // 寻找字符区域
    const regions = [];
    let inChar = false;
    let start = 0;

    for (let x = 0; x < width; x++) {
      if (projection[x] > 0 && !inChar) {
        start = x;
        inChar = true;
      } else if (projection[x] === 0 && inChar) {
        if (x - start >= 8) { // 最小字符宽度
          regions.push({ start, end: x });
        }
        inChar = false;
      }
    }

    if (inChar && width - start >= 8) {
      regions.push({ start, end: width });
    }

    // 合并过窄的区域或分割过宽的区域
    const finalRegions = [];
    for (const region of regions) {
      const width = region.end - region.start;
      if (width > 35) {
        // 可能包含两个字符，尝试分割
        const mid = region.start + Math.floor(width / 2);
        finalRegions.push({ start: region.start, end: mid });
        finalRegions.push({ start: mid, end: region.end });
      } else if (width >= 8) {
        finalRegions.push(region);
      }
    }

    return finalRegions;
  }

  /**
   * 提取单个字符图像
   */
  extractCharImage(binary, region, width, height) {
    const charWidth = region.end - region.start;

    // 找到垂直范围
    let top = height, bottom = 0;
    for (let y = 0; y < height; y++) {
      for (let x = region.start; x < region.end; x++) {
        if (binary[y * width + x] === 1) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }

    const charHeight = bottom - top + 1;

    // 创建标准尺寸的字符图像 (16x24)
    const charImg = new Array(16 * 24).fill(0);
    const scaleX = 16 / charWidth;
    const scaleY = 24 / charHeight;

    for (let y = top; y <= bottom; y++) {
      for (let x = region.start; x < region.end; x++) {
        if (binary[y * width + x] === 1) {
          const newX = Math.min(15, Math.floor((x - region.start) * scaleX));
          const newY = Math.min(23, Math.floor((y - top) * scaleY));
          charImg[newY * 16 + newX] = 1;
        }
      }
    }

    return charImg;
  }

  /**
   * 识别单个字符
   */
  recognizeChar(charImg) {
    // 将字符图像转换为特征
    const features = this.charImgToFeatures(charImg);

    let bestChar = '?';
    let bestScore = -1;

    for (const [char, charFeatures] of this.charFeatures) {
      const score = this.calculateSimilarity(features, charFeatures);
      if (score > bestScore) {
        bestScore = score;
        bestChar = char;
      }
    }

    return {
      char: bestChar,
      confidence: Math.min(100, bestScore * 100)
    };
  }

  /**
   * 将字符图像转换为特征
   */
  charImgToFeatures(charImg) {
    // 创建临时 canvas 来计算特征
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 16;
    canvas.height = 24;

    const imageData = ctx.createImageData(16, 24);
    for (let i = 0; i < charImg.length; i++) {
      const val = charImg[i] === 1 ? 0 : 255;
      imageData.data[i * 4] = val;
      imageData.data[i * 4 + 1] = val;
      imageData.data[i * 4 + 2] = val;
      imageData.data[i * 4 + 3] = 255;
    }

    return this.extractFeatures(imageData);
  }

  /**
   * 计算特征相似度
   */
  calculateSimilarity(features1, features2) {
    if (features1.length !== features2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < features1.length; i++) {
      dotProduct += features1[i] * features2[i];
      norm1 += features1[i] * features1[i];
      norm2 += features2[i] * features2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 设置是否使用本地 OCR 服务
   */
  setUseLocalOcr(useLocal) {
    this.useLocalOcr = useLocal;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CaptchaRecognizer;
}
