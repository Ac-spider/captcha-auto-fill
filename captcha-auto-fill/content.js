/**
 * 验证码自动识别内容脚本
 * 用于检测、识别并自动填写网页验证码
 */

(function() {
  'use strict';

  // 全局状态
  let isEnabled = true;
  let isProcessing = false;
  let recognizedCaptcha = null;
  let isOneClickLoginMode = false;  // 一键登录模式标志
  let oneClickLoginEnabled = false; // 一键登录功能是否启用
  let autoLoginTriggered = false;   // 自动登录是否已触发（防止重复提交）
  let isLoggingIn = false;          // 是否正在登录过程中（防止页面跳转时重复检测）
  let autoFillCredentials = false;  // 是否自动填充用户名密码
  let credentialsFilled = false;    // 是否已经填充过账号密码（防止重复填充）
  let jaccountUser = '';            // 保存的jAccount用户名
  let jaccountPass = '';            // 保存的jAccount密码
  let loginRetryCount = 0;          // 登录重试次数计数器
  const MAX_LOGIN_RETRIES = 3;      // 最大登录重试次数

  // 验证码特征关键词
  const CAPTCHA_KEYWORDS = [
    'captcha', 'verify', 'verification', 'code', 'checkcode',
    '验证码', '校验码', '验证', '识别码', 'jaccount'
  ];

  // 验证码尺寸范围
  const CAPTCHA_SIZE = {
    minWidth: 60,
    maxWidth: 300,
    minHeight: 20,
    maxHeight: 100
  };

  /**
   * 初始化
   */
  function init() {
    console.log('[Captcha Auto-Fill] 内容脚本已加载');

    // 重置登录状态标志
    isLoggingIn = false;
    autoLoginTriggered = false;
    isOneClickLoginMode = false;
    credentialsFilled = false;  // 重置账号填充标志
    loginRetryCount = 0;        // 重置登录重试计数器

    // 从存储中读取设置
    chrome.storage.sync.get(['enabled', 'oneClickLogin', 'autoFillCredentials', 'jaccountUser', 'jaccountPass'], (result) => {
      isEnabled = result.enabled !== false;
      oneClickLoginEnabled = result.oneClickLogin === true;
      autoFillCredentials = result.autoFillCredentials === true;
      jaccountUser = result.jaccountUser || '';
      jaccountPass = result.jaccountPass || '';

      console.log('[Captcha Auto-Fill] 设置加载完成:', {
        enabled: isEnabled,
        oneClickLogin: oneClickLoginEnabled,
        autoFillCredentials: autoFillCredentials,
        hasUser: !!jaccountUser,
        hasPass: !!jaccountPass
      });

      if (isEnabled) {
        startCaptchaDetection();
      }
    });

    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener(handleMessage);

    // 监听DOM变化
    observeDOMChanges();
  }

  /**
   * 显示页面通知
   * @param {string} message - 通知消息
   * @param {string} type - 通知类型: 'info', 'success', 'error'
   */
  function showNotification(message, type = 'info') {
    // 移除已有的通知
    const existingNotification = document.getElementById('captcha-auto-fill-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // 创建通知元素
    const notification = document.createElement('div');
    notification.id = 'captcha-auto-fill-notification';

    // 设置样式
    const colors = {
      info: { bg: '#2196F3', icon: 'ℹ️' },
      success: { bg: '#4CAF50', icon: '✓' },
      error: { bg: '#f44336', icon: '✗' }
    };
    const color = colors[type] || colors.info;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${color.bg};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: captcha-notification-slide-in 0.3s ease-out;
      pointer-events: none;
    `;

    // 添加动画样式
    if (!document.getElementById('captcha-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'captcha-notification-styles';
      style.textContent = `
        @keyframes captcha-notification-slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes captcha-notification-fade-out {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    notification.innerHTML = `
      <span style="font-size: 16px;">${color.icon}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(notification);

    // 3秒后自动移除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'captcha-notification-fade-out 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
      }
    }, 3000);
  }

  /**
   * 处理来自popup的消息
   */
  function handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'toggle':
        isEnabled = request.enabled;
        if (isEnabled) {
          startCaptchaDetection();
        }
        sendResponse({ success: true, enabled: isEnabled });
        break;

      case 'getStatus':
        sendResponse({
          enabled: isEnabled,
          isProcessing: isProcessing,
          recognizedCaptcha: recognizedCaptcha
        });
        break;

      case 'manualRecognize':
        // 显示视觉反馈
        showNotification('正在识别验证码...', 'info');

        // 对于 jaccount 页面，使用专门的处理逻辑
        if (window.location.href.includes('jaccount.sjtu.edu.cn')) {
          handleJaccountCaptcha();
          sendResponse({ success: true, message: 'jaccount 验证码识别已触发' });
        } else {
          const captchas = findCaptchaImages();
          if (captchas.length > 0) {
            processCaptcha(captchas[0]);
            sendResponse({ success: true, count: captchas.length });
          } else {
            showNotification('未找到验证码图片', 'error');
            sendResponse({ success: false, count: 0, error: '未找到验证码' });
          }
        }
        break;

      case 'fillCaptcha':
        if (request.text) {
          fillCaptchaInput(request.text).then(success => {
            sendResponse({ success });
          });
          return true; // 保持消息通道开启
        }
        break;

      case 'engineChanged':
        // 识别引擎已更改，重新初始化识别器
        if (recognizer) {
          // 加载对应引擎的 API Key
          loadEngineConfig(request.engine).then(config => {
            recognizer.setEngine(request.engine, config);
            console.log('[Captcha Auto-Fill] 识别引擎已切换为:', request.engine);
          });
        }
        sendResponse({ success: true });
        break;

      case 'oneClickLogin':
        // 一键登录（手动触发）
        handleOneClickLogin().then(result => {
          sendResponse(result);
        });
        return true;  // 保持消息通道开启

      case 'oneClickLoginChanged':
        // 一键登录设置已更改
        oneClickLoginEnabled = request.enabled;
        console.log('[Captcha Auto-Fill] 一键登录已' + (oneClickLoginEnabled ? '启用' : '禁用'));
        sendResponse({ success: true });
        break;

      case 'autoFillCredentialsChanged':
        // 自动填充账号密码设置已更改
        autoFillCredentials = request.enabled;
        console.log('[Captcha Auto-Fill] 自动填充账号密码已' + (autoFillCredentials ? '启用' : '禁用'));
        sendResponse({ success: true });
        break;

      case 'updateCredentials':
        // 更新保存的账号密码
        jaccountUser = request.user || '';
        jaccountPass = request.pass || '';
        console.log('[Captcha Auto-Fill] 账号密码已更新');
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
  }

  /**
   * 查找页面中的验证码图片
   * 修复：优先检测 img#captcha-img，排除 64x64 图标，处理 src 为空的情况
   */
  function findCaptchaImages() {
    // 首先尝试 jaccount 特定的选择器 - 优先 img#captcha-img
    const jaccountCaptcha = document.querySelector('img#captcha-img');
    if (jaccountCaptcha) {
      // 检查图片尺寸，排除 64x64 的图标
      const width = jaccountCaptcha.naturalWidth || jaccountCaptcha.width;
      const height = jaccountCaptcha.naturalHeight || jaccountCaptcha.height;

      // 如果是 64x64 图标，说明是占位图，需要刷新
      if (width === 64 && height === 64) {
        console.log('[Captcha Auto-Fill] 检测到 64x64 占位图标，需要刷新验证码');
        triggerCaptchaRefresh();
        return [];
      }

      // 如果 src 为空或包含占位图路径，尝试刷新
      if (!jaccountCaptcha.src ||
          jaccountCaptcha.src.includes('image/captcha.png') ||
          jaccountCaptcha.src === window.location.href) {
        console.log('[Captcha Auto-Fill] 验证码图片 src 为空或无效，尝试刷新');
        triggerCaptchaRefresh();
        return [];
      }

      console.log('[Captcha Auto-Fill] 通过 img#captcha-img 找到验证码图片:', jaccountCaptcha.src);
      return [{
        element: jaccountCaptcha,
        score: 1.0,
        src: jaccountCaptcha.src
      }];
    }

    // 备选选择器
    const fallbackCaptcha = document.querySelector('#captcha-img img, .captcha-img img');
    if (fallbackCaptcha) {
      console.log('[Captcha Auto-Fill] 通过备选选择器找到验证码图片:', fallbackCaptcha.src);
      return [{
        element: fallbackCaptcha,
        score: 1.0,
        src: fallbackCaptcha.src
      }];
    }

    // 通用检测 - 排除 64x64 图标
    const images = document.querySelectorAll('img');
    const captchaCandidates = [];

    images.forEach(img => {
      // 排除 64x64 图标
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (width === 64 && height === 64) {
        return; // 跳过 64x64 图标
      }

      const score = calculateCaptchaScore(img);
      if (score > 0.5) {
        captchaCandidates.push({
          element: img,
          score: score,
          src: img.src
        });
      }
    });

    // 按得分排序
    captchaCandidates.sort((a, b) => b.score - a.score);

    console.log('[Captcha Auto-Fill] 找到候选验证码:', captchaCandidates.length);
    return captchaCandidates;
  }

  /**
   * 触发验证码刷新
   * 尝试调用页面上的 refreshCaptcha 函数或点击刷新按钮
   */
  function triggerCaptchaRefresh() {
    console.log('[Captcha Auto-Fill] 尝试刷新验证码');

    // 方法1：尝试调用页面上的 refreshCaptcha 函数
    if (typeof window.refreshCaptcha === 'function') {
      try {
        window.refreshCaptcha();
        console.log('[Captcha Auto-Fill] 已调用 window.refreshCaptcha()');
        return true;
      } catch (e) {
        console.warn('[Captcha Auto-Fill] 调用 refreshCaptcha 失败:', e);
      }
    }

    // 方法2：查找并点击刷新按钮
    const refreshBtn = document.querySelector('#captcha-refresh, .captcha-refresh, .refresh-captcha, [onclick*="refreshCaptcha"]');
    if (refreshBtn) {
      refreshBtn.click();
      console.log('[Captcha Auto-Fill] 已点击刷新按钮');
      return true;
    }

    // 方法3：对于 jaccount，点击图片本身可能触发刷新
    const captchaImg = document.querySelector('img#captcha-img');
    if (captchaImg && (!captchaImg.src || captchaImg.src.includes('image/captcha.png'))) {
      captchaImg.click();
      console.log('[Captcha Auto-Fill] 已点击验证码图片尝试刷新');
      return true;
    }

    console.warn('[Captcha Auto-Fill] 无法找到刷新验证码的方法');
    return false;
  }

  /**
   * 计算图片作为验证码的可能性得分
   */
  function calculateCaptchaScore(img) {
    let score = 0;
    const rect = img.getBoundingClientRect();

    // 检查尺寸特征
    const width = rect.width || img.naturalWidth;
    const height = rect.height || img.naturalHeight;

    if (width >= CAPTCHA_SIZE.minWidth && width <= CAPTCHA_SIZE.maxWidth &&
        height >= CAPTCHA_SIZE.minHeight && height <= CAPTCHA_SIZE.maxHeight) {
      score += 0.3;
    }

    // 检查URL关键词
    const src = img.src.toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const title = (img.title || '').toLowerCase();

    for (const keyword of CAPTCHA_KEYWORDS) {
      if (src.includes(keyword.toLowerCase())) {
        score += 0.4;
        break;
      }
    }

    for (const keyword of CAPTCHA_KEYWORDS) {
      if (alt.includes(keyword.toLowerCase()) || title.includes(keyword.toLowerCase())) {
        score += 0.2;
        break;
      }
    }

    // 检查相邻输入框
    const hasInput = findRelatedInput(img) !== null;
    if (hasInput) {
      score += 0.3;
    }

    // 针对jaccount的特殊检测
    if (src.includes('jaccount') || src.includes('captcha')) {
      score += 0.3;
    }

    return score;
  }

  /**
   * 查找与验证码图片相关的输入框
   * 增强版本：根据 jAccount 页面结构优化
   */
  function findRelatedInput(imgElement) {
    // 方法1：jaccount特定选择器（最优先）
    // 优先选择图片验证码输入框，避免选中短信验证码输入框
    const jaccountSelectors = [
      'input#input-login-captcha',           // jAccount 图片验证码特定ID
      'input#captcha',
      'input[name="captcha"]',               // name="captcha" 通常是图片验证码
      'input.captcha',
      '#captcha-input input',
      '.captcha-input input',
      'input[placeholder*="请输入验证码"]',  // jAccount 特定占位符
      'input[placeholder*="图形验证码"]',
      'input[placeholder*="图片验证码"]',
      'input[aria-label*="图形验证码"]',
      'input[aria-label*="图片验证码"]'
    ];

    for (const selector of jaccountSelectors) {
      const input = document.querySelector(selector);
      if (input) {
        console.log('[Captcha Auto-Fill] 通过选择器找到输入框:', selector);
        return input;
      }
    }

    // 方法2：查找相邻的input元素（包括兄弟元素的子元素）
    let sibling = imgElement.nextElementSibling;
    while (sibling) {
      // 直接是 input
      if (sibling.tagName === 'INPUT' &&
          (sibling.type === 'text' || sibling.type === '')) {
        console.log('[Captcha Auto-Fill] 通过相邻元素找到输入框');
        return sibling;
      }
      // 兄弟元素中包含 input
      const inputInSibling = sibling.querySelector('input[type="text"], input:not([type])');
      if (inputInSibling) {
        console.log('[Captcha Auto-Fill] 通过相邻元素的子元素找到输入框');
        return inputInSibling;
      }
      sibling = sibling.nextElementSibling;
    }

    // 方法3：查找父元素及祖先元素内的input
    let parent = imgElement.parentElement;
    for (let i = 0; i < 3 && parent; i++) {  // 向上查找3层
      const inputs = parent.querySelectorAll('input[type="text"], input:not([type])');
      for (const input of inputs) {
        // 排除密码输入框
        if (input.type !== 'password' && input !== imgElement) {
          console.log('[Captcha Auto-Fill] 通过父元素找到输入框');
          return input;
        }
      }
      parent = parent.parentElement;
    }

    // 方法4：根据页面所有 input 的特征查找
    // 策略：找到所有文本输入框，排除用户名、密码和短信验证码框
    const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
    const usernameValue = 'lvxseraph';  // 已知用户名

    for (const input of allInputs) {
      const placeholder = (input.placeholder || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const value = (input.value || '').toLowerCase();
      const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();

      // 跳过用户名、密码输入框和短信验证码框
      if (value === usernameValue.toLowerCase() ||
          input.type === 'password' ||
          name.includes('user') ||
          name.includes('name') ||
          id.includes('user') ||
          id.includes('name') ||
          id.includes('sms') ||              // 排除短信验证码框
          name.includes('sms') ||            // 排除短信验证码框
          ariaLabel.includes('短信') ||      // 排除短信验证码框
          ariaLabel.includes('sms') ||       // 排除短信验证码框
          placeholder.includes('用户名') ||
          placeholder.includes('账号') ||
          placeholder.includes('密码') ||
          ariaLabel.includes('用户名') ||
          ariaLabel.includes('密码')) {
        continue;
      }

      // 检查是否包含验证码相关关键词
      for (const keyword of CAPTCHA_KEYWORDS) {
        if (placeholder.includes(keyword) ||
            name.includes(keyword) ||
            id.includes(keyword) ||
            ariaLabel.includes(keyword)) {
          console.log('[Captcha Auto-Fill] 通过关键词找到输入框:', keyword);
          return input;
        }
      }

      // 特殊处理：如果 placeholder 包含"请输入"
      if (placeholder.includes('请输入') && !placeholder.includes('用户名') && !placeholder.includes('密码')) {
        console.log('[Captcha Auto-Fill] 通过"请输入"模式找到输入框');
        return input;
      }
    }

    // 方法5：兜底策略，找页面上排除短信验证码框后的文本输入框
    const textInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
      .filter(input => {
        if (input.type === 'password' || input.type === 'hidden') return false;
        const id = (input.id || '').toLowerCase();
        const name = (input.name || '').toLowerCase();
        const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
        // 排除短信验证码框
        if (id.includes('sms') || name.includes('sms') || ariaLabel.includes('短信') || ariaLabel.includes('sms')) {
          return false;
        }
        return true;
      });

    if (textInputs.length >= 2) {
      // 通常验证码是第2个（排除用户名）或第3个文本输入框
      console.log('[Captcha Auto-Fill] 通过位置推断找到输入框（第2个文本输入框）:', textInputs[1].id || textInputs[1].name);
      return textInputs[1];
    }

    console.warn('[Captcha Auto-Fill] 未找到验证码输入框');
    return null;
  }

  /**
   * 处理验证码识别
   * 修复：添加识别结果为空时的重试逻辑
   */
  async function processCaptcha(captchaInfo, targetInput = null) {
    if (isProcessing) {
      console.log('[Captcha Auto-Fill] 正在处理中，跳过');
      return;
    }

    // 关键修复：如果正在登录过程中，跳过新的验证码检测
    if (isLoggingIn) {
      console.log('[Captcha Auto-Fill] 正在登录过程中，跳过验证码检测');
      return;
    }

    isProcessing = true;
    recognizedCaptcha = null;

    try {
      console.log('[Captcha Auto-Fill] 开始识别验证码:', captchaInfo.src);

      // 获取图片数据
      const imageData = await getImageData(captchaInfo.element);
      console.log('[Captcha Auto-Fill] 获取到图片数据');

      // 对于在线 OCR 服务，直接使用原始图片
      // 预处理图片（可选，如果需要的话）
      // const processedImage = await preprocessImage(imageData);
      console.log('[Captcha Auto-Fill] 使用原始图片进行识别');

      // OCR识别
      console.log('[Captcha Auto-Fill] 准备识别，图片src:', captchaInfo.src?.substring(0, 100) + '...');
      const result = await recognizeWithOCR(imageData);
      console.log('[Captcha Auto-Fill] OCR识别结果:', result, '图片:', captchaInfo.src?.substring(0, 50) + '...');

      if (result && result.text) {
        const cleanText = result.text.trim().replace(/\s/g, '');
        console.log('[Captcha Auto-Fill] 识别结果:', cleanText, '置信度:', result.confidence);

        recognizedCaptcha = {
          text: cleanText,
          confidence: result.confidence,
          imageSrc: captchaInfo.src
        };

        // 自动填写
        const input = targetInput || findRelatedInput(captchaInfo.element);
        if (input) {
          console.log('[Captcha Auto-Fill] 找到输入框，准备填写:', cleanText);
          // 关键修复：等待填写完成并验证
          const filled = await fillCaptchaInput(cleanText, input);
          console.log('[Captcha Auto-Fill] 填写结果:', filled ? '成功' : '失败');

          if (!filled) {
            showNotification('验证码填写失败', 'error');
            return;
          }

          // 显示成功通知
          showNotification(`验证码已识别: ${cleanText}`, 'success');

          // 如果开启了一键登录，自动点击登录按钮
          // 重新读取设置以确保最新状态
          const currentSettings = await chrome.storage.sync.get('oneClickLogin');
          const shouldAutoLogin = currentSettings.oneClickLogin === true;
          console.log('[Captcha Auto-Fill] 一键登录状态:', { cached: oneClickLoginEnabled, current: shouldAutoLogin });

          if (shouldAutoLogin) {
            console.log('[Captcha Auto-Fill] 一键登录已启用，准备自动提交');
            await new Promise(resolve => setTimeout(resolve, 500));
            await autoClickLoginButton();
          } else {
            console.log('[Captcha Auto-Fill] 验证码已填写，请手动点击登录按钮');
          }
        } else {
          console.warn('[Captcha Auto-Fill] 未找到验证码输入框');
          showNotification('未找到验证码输入框', 'error');
        }

        // 通知popup
        chrome.runtime.sendMessage({
          action: 'recognitionComplete',
          result: recognizedCaptcha
        }).catch(() => {
          // popup可能未打开，忽略错误
        });
      } else {
        console.warn('[Captcha Auto-Fill] 识别结果为空，可能是获取到了错误的图片（如 64x64 图标）');
        showNotification('识别失败，请刷新验证码后重试', 'error');

        // 检查是否是 64x64 图标问题
        const width = captchaInfo.element.naturalWidth || captchaInfo.element.width;
        const height = captchaInfo.element.naturalHeight || captchaInfo.element.height;

        if (width === 64 && height === 64) {
          console.log('[Captcha Auto-Fill] 检测到 64x64 图标，尝试刷新验证码后重试');
          triggerCaptchaRefresh();

          // 延迟后重新检测
          setTimeout(() => {
            const captchas = findCaptchaImages();
            if (captchas.length > 0) {
              processCaptcha(captchas[0], targetInput);
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('[Captcha Auto-Fill] 识别失败:', error);

      // 如果是 src 无效错误，尝试刷新后重试
      if (error.message && (error.message.includes('src 无效') || error.message.includes('64x64'))) {
        console.log('[Captcha Auto-Fill] 尝试刷新验证码后重试');
        triggerCaptchaRefresh();
        setTimeout(() => {
          const captchas = findCaptchaImages();
          if (captchas.length > 0) {
            processCaptcha(captchas[0], targetInput);
          }
        }, 1000);
      }
    } finally {
      isProcessing = false;
    }
  }

  /**
   * 获取图片数据
   * 直接从已加载的 img 元素提取（避免重新 fetch 导致验证码刷新）
   * 修复：处理 src 为空的情况，添加重试机制，确保获取最新图片
   */
  async function getImageData(imgElement) {
    // 检查图片 src 是否有效
    if (!imgElement.src ||
        imgElement.src === window.location.href ||
        imgElement.src.includes('image/captcha.png')) {
      console.log('[Captcha Auto-Fill] 图片 src 无效，尝试刷新验证码');
      triggerCaptchaRefresh();

      // 等待图片加载
      await new Promise(resolve => setTimeout(resolve, 600));

      // 重新检查 src
      if (!imgElement.src ||
          imgElement.src === window.location.href ||
          imgElement.src.includes('image/captcha.png')) {
        throw new Error('验证码图片 src 仍然无效');
      }
    }

    // 如果图片还没加载完成，等待加载
    if (!imgElement.complete) {
      console.log('[Captcha Auto-Fill] 等待图片加载完成...');
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('图片加载超时'));
        }, 3000);

        imgElement.onload = () => {
          clearTimeout(timeout);
          resolve();
        };
        imgElement.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('图片加载失败'));
        };
      });
    }

    // 检查图片尺寸，排除 64x64 图标
    const width = imgElement.naturalWidth || imgElement.width;
    const height = imgElement.naturalHeight || imgElement.height;
    if (width === 64 && height === 64) {
      console.log('[Captcha Auto-Fill] 检测到 64x64 占位图标，尝试刷新');
      triggerCaptchaRefresh();
      await new Promise(resolve => setTimeout(resolve, 600));

      // 重新检查尺寸
      const newWidth = imgElement.naturalWidth || imgElement.width;
      const newHeight = imgElement.naturalHeight || imgElement.height;
      if (newWidth === 64 && newHeight === 64) {
        throw new Error('验证码仍然是 64x64 占位图标');
      }
    }

    try {
      // 关键修复：强制等待以确保获取最新图片
      // 在验证码刷新后，即使 img.complete 为 true，也可能需要额外时间让浏览器渲染新图片
      if (!imgElement.complete || imgElement.naturalWidth === 0) {
        console.log('[Captcha Auto-Fill] 图片正在加载中，等待加载完成...');
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.warn('[Captcha Auto-Fill] 等待图片加载超时');
            resolve(); // 超时后继续尝试
          }, 2000);

          const cleanup = () => {
            clearTimeout(timeout);
            imgElement.onload = null;
            imgElement.onerror = null;
          };

          imgElement.onload = () => {
            cleanup();
            console.log('[Captcha Auto-Fill] 图片加载完成，尺寸:', imgElement.naturalWidth, 'x', imgElement.naturalHeight);
            resolve();
          };

          imgElement.onerror = () => {
            cleanup();
            console.warn('[Captcha Auto-Fill] 图片加载失败');
            reject(new Error('图片加载失败'));
          };
        });
      }

      // 再次检查图片尺寸
      if (imgElement.naturalWidth === 0 || imgElement.naturalHeight === 0) {
        throw new Error('图片尺寸为0，可能尚未加载完成');
      }

      // 直接从 img 元素绘制到 canvas，获取当前显示的图片数据
      // 这样可以确保获取的是页面上实际显示的验证码，而不是重新请求的新验证码
      console.log('[Captcha Auto-Fill] 从 img 元素提取图片数据，当前 src:', imgElement.src.substring(imgElement.src.lastIndexOf('/') + 1));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // 设置 canvas 尺寸为图片原始尺寸
      canvas.width = imgElement.naturalWidth || imgElement.width;
      canvas.height = imgElement.naturalHeight || imgElement.height;

      // 关键修复：清除 canvas 以确保不会保留旧数据
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 绘制图片
      ctx.drawImage(imgElement, 0, 0);

      // 转换为 base64
      const base64 = canvas.toDataURL('image/png');
      console.log('[Captcha Auto-Fill] 从 img 提取成功，尺寸:', canvas.width, 'x', canvas.height, 'base64 长度:', base64.length);

      // 验证提取的图片不是 64x64 的图标
      if (canvas.width === 64 && canvas.height === 64) {
        throw new Error('提取到的是 64x64 占位图标');
      }

      // 验证 canvas 不为空（检查是否所有像素都是透明的或相同的颜色）
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let hasContent = false;
        // 采样检查，每隔10个像素检查一次
        for (let i = 3; i < data.length; i += 40) { // 从alpha通道开始，每次跳过10个像素
          if (data[i] > 0) { // alpha > 0 表示有内容
            hasContent = true;
            break;
          }
        }
        if (!hasContent) {
          console.warn('[Captcha Auto-Fill] Canvas 内容为空，可能是图片未正确加载');
        }
      } catch (e) {
        // 跨域图片可能无法读取像素，忽略错误
      }

      return base64;
    } catch (error) {
      // 关键修复：不再使用 fetch 作为 fallback，因为 fetch 会导致验证码刷新
      // 如果 canvas 提取失败，直接抛出错误，让上层处理
      console.error('[Captcha Auto-Fill] 从 img 提取失败:', error.message);
      console.warn('[Captcha Auto-Fill] 注意：使用 fetch 获取验证码图片会导致验证码刷新，因此禁用此 fallback');
      throw new Error(`获取验证码图片失败: ${error.message}`);
    }
  }

  /**
   * 将 Blob 转换为 base64
   */
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 使用 XMLHttpRequest 获取图片（备选方案）
   */
  function fetchWithXHR(imageUrl) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', imageUrl, true);
      xhr.responseType = 'blob';

      // 设置请求头
      xhr.setRequestHeader('Accept', 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8');
      xhr.setRequestHeader('Cache-Control', 'no-cache');

      xhr.onload = function() {
        if (xhr.status === 200) {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(xhr.response);
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('XHR 请求失败'));
      xhr.send();
    });
  }

  /**
   * 预处理图片以提高识别率
   */
  function preprocessImage(imageSrc) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // 设置画布尺寸
        canvas.width = img.width;
        canvas.height = img.height;

        // 绘制原图
        ctx.drawImage(img, 0, 0);

        // 获取图像数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // 灰度化和二值化
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const threshold = 128;
          const value = gray > threshold ? 255 : 0;
          data[i] = value;
          data[i + 1] = value;
          data[i + 2] = value;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = () => {
        // 如果跨域失败，直接返回原图
        resolve(imageSrc);
      };

      img.src = imageSrc;
    });
  }

  // 全局验证码识别器实例
  let recognizer = null;

  /**
   * 获取识别器实例
   */
  async function getRecognizer() {
    if (!recognizer) {
      recognizer = new CaptchaRecognizer();
      await recognizer.init();

      // 加载并设置当前引擎
      const settings = await chrome.storage.sync.get(['recognitionEngine']);
      const engine = settings.recognitionEngine || 'local';
      const config = await loadEngineConfig(engine);
      await recognizer.setEngine(engine, config);
    }
    return recognizer;
  }

  /**
   * OCR识别 - 使用本地验证码识别器
   */
  async function recognizeWithOCR(imageData) {
    try {
      const rec = await getRecognizer();
      const result = await rec.recognize(imageData);
      console.log('[Captcha Auto-Fill] 识别结果:', result);
      return result;
    } catch (error) {
      console.error('[Captcha Auto-Fill] 识别错误:', error);
      return { text: '', confidence: 0 };
    }
  }

  /**
   * 填写验证码到输入框
   * 增强版本，支持 React/Vue/Angular 等现代框架
   * 修复：返回 Promise，确保验证完成后再继续
   */
  async function fillCaptchaInput(text, inputElement = null) {
    const input = inputElement || findRelatedInput(document.querySelector('img[src*="captcha"]'));

    if (!input) {
      console.warn('[Captcha Auto-Fill] 未找到验证码输入框');
      return false;
    }

    console.log('[Captcha Auto-Fill] 开始填写，目标输入框:', input.id || input.name || 'unnamed');

    // 滚动到输入框可见
    input.scrollIntoView({ behavior: 'instant', block: 'center' });

    // 聚焦输入框
    input.focus();
    input.click();

    // 先清空输入框
    input.value = '';

    // 获取原生 value 属性描述符，绕过 React/Vue 等框架的拦截
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

    // 对于 React，需要先设置 _valueTracker
    const tracker = input._valueTracker;
    if (tracker) {
      tracker.setValue('');
    }

    // 逐个字符输入，模拟真实打字
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // 触发 keydown
      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0)
      }));

      // 设置当前值
      const currentValue = input.value + char;
      nativeInputValueSetter.call(input, currentValue);

      // 对于 React
      if (tracker) {
        tracker.setValue(currentValue);
      }

      // 触发 input 事件
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: char
      }));

      // 触发 keyup
      input.dispatchEvent(new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: char.charCodeAt(0)
      }));
    }

    // 触发 change 事件
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    // 对于 Vue.js，触发 compositionend 事件
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));

    // 触发 blur
    input.dispatchEvent(new Event('blur', { bubbles: true }));

    // 失去焦点
    input.blur();

    console.log('[Captcha Auto-Fill] 已填写验证码:', text);

    // 等待验证完成
    await new Promise(resolve => setTimeout(resolve, 200));

    // 对于 jaccount，使用 jQuery 设置值（如果页面使用了 jQuery）
    // 注意：必须使用精确的选择器 #input-login-captcha，避免选中短信验证码框
    if (window.location.href.includes('jaccount.sjtu.edu.cn') && typeof window.jQuery !== 'undefined') {
      const $ = window.jQuery;
      // 使用精确ID选择器，避免选中其他captcha输入框
      const jqueryVal = $('#input-login-captcha').val();
      if (jqueryVal !== text) {
        console.log('[Captcha Auto-Fill] jQuery val 不同步，使用 jQuery 设置值:', jqueryVal, '->', text);
        $('#input-login-captcha').val(text).trigger('input').trigger('change');
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    // 验证是否填写成功
    if (input.value === text) {
      console.log('[Captcha Auto-Fill] 验证成功，验证码已填写:', input.value);
      return true;
    } else {
      console.warn('[Captcha Auto-Fill] 验证失败，期望:', text, '实际:', input.value);
      // 重试：直接设置值
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // 再次等待验证
      await new Promise(resolve => setTimeout(resolve, 150));

      if (input.value === text) {
        console.log('[Captcha Auto-Fill] 重试后验证成功');
        return true;
      } else {
        console.error('[Captcha Auto-Fill] 重试后仍然失败');
        return false;
      }
    }
  }

  /**
   * 下载验证码图片到本地 - 已禁用
   * 使用已获取的 imageData 直接下载，避免 session 不一致问题
   * @param {string} imageData - 图片的 base64 数据
   * @param {string} imageUrl - 图片的原始 URL
   * @param {string} engine - 识别引擎类型: 'local', 'kimi', 'online', 'algorithm'
   */
  // eslint-disable-next-line no-unused-vars
  function downloadCaptchaImage(imageData, imageUrl, engine = 'unknown') {
    // 下载功能已禁用
    console.log('[Captcha Auto-Fill] 下载验证码功能已禁用');
    return;

    // 以下是原来的代码，已禁用
    /*
    try {
      // 获取域名用于文件名
      const domain = window.location.hostname.replace(/[^a-zA-Z0-9]/g, '_');

      console.log(`[Captcha Auto-Fill] 正在下载验证码图片 [${engine}]:`, imageUrl);

      // 发送下载请求给 background script
      // 传递已获取的 imageData (base64)，不再重新获取
      chrome.runtime.sendMessage({
        action: 'downloadCaptcha',
        image: imageData,  // 传递已获取的 base64 数据
        domain: domain,
        originalUrl: imageUrl,
        engine: engine  // 传递引擎类型，用于分类保存
      }, (response) => {
        if (response && response.success) {
          console.log(`[Captcha Auto-Fill] 验证码图片已下载 [${engine}]:`, response.filename);
        } else {
          console.error(`[Captcha Auto-Fill] 下载失败 [${engine}]:`, response ? response.error : '未知错误');
        }
      });
    } catch (error) {
      console.error('[Captcha Auto-Fill] 下载验证码失败:', error);
    }
    */
  }

  /**
   * 开始验证码检测
   */
  function startCaptchaDetection() {
    console.log('[Captcha Auto-Fill] 开始检测验证码');

    // 延迟检测，等待页面完全加载
    setTimeout(() => {
      // 首先尝试 jaccount 特定处理
      if (window.location.href.includes('jaccount.sjtu.edu.cn')) {
        handleJaccountCaptcha();
        return;
      }

      const captchas = findCaptchaImages();
      console.log(`[Captcha Auto-Fill] 找到 ${captchas.length} 个候选验证码`);

      if (captchas.length > 0) {
        // 处理得分最高的验证码
        processCaptcha(captchas[0]);
      }
    }, 1000);
  }

  /**
   * 自动填充用户名和密码
   * 在验证码识别之前调用，确保表单完整填写
   */
  async function fillCredentials() {
    // 检查是否启用了自动填充且有保存的账号密码
    console.log('[Captcha Auto-Fill] fillCredentials 被调用:', {
      autoFillCredentials,
      hasUser: !!jaccountUser,
      hasPass: !!jaccountPass,
      userLength: jaccountUser?.length,
      passLength: jaccountPass?.length
    });

    if (!autoFillCredentials) {
      console.log('[Captcha Auto-Fill] 自动填充未启用');
      return false;
    }

    if (!jaccountUser || !jaccountPass) {
      console.log('[Captcha Auto-Fill] 账号密码未设置');
      return false;
    }

    // 防止重复填充
    if (credentialsFilled) {
      console.log('[Captcha Auto-Fill] 账号密码已经填充过，跳过');
      return true;
    }

    console.log('[Captcha Auto-Fill] 开始自动填充账号密码');

    // 查找用户名和密码输入框
    const userInput = document.getElementById('input-login-user');
    const passInput = document.getElementById('input-login-pass');

    if (!userInput || !passInput) {
      console.warn('[Captcha Auto-Fill] 未找到用户名或密码输入框');
      return false;
    }

    // 检查输入框是否已经有值（可能是浏览器自动填充的）
    const existingUser = userInput.value;
    const existingPass = passInput.value;
    console.log('[Captcha Auto-Fill] 输入框当前值:', {
      user: existingUser || '空',
      pass: existingPass ? '有值' : '空'
    });

    try {
      // 只在输入框为空时填充
      if (!existingUser) {
        await fillInputValue(userInput, jaccountUser);
        console.log('[Captcha Auto-Fill] 用户名已填充');
      } else {
        console.log('[Captcha Auto-Fill] 用户名已有值，跳过填充');
      }

      if (!existingPass) {
        await fillInputValue(passInput, jaccountPass);
        console.log('[Captcha Auto-Fill] 密码已填充');
      } else {
        console.log('[Captcha Auto-Fill] 密码已有值，跳过填充');
      }

      credentialsFilled = true;
      showNotification('账号密码已自动填充', 'info');
      return true;
    } catch (error) {
      console.error('[Captcha Auto-Fill] 填充账号密码失败:', error);
      return false;
    }
  }

  /**
   * 通用输入框填充函数
   * 支持 React/Vue/Angular 等现代框架
   */
  async function fillInputValue(input, value) {
    // 滚动到输入框可见
    input.scrollIntoView({ behavior: 'instant', block: 'center' });

    // 聚焦输入框
    input.focus();
    input.click();

    // 清空输入框
    input.value = '';

    // 获取原生 value 属性描述符，绕过 React/Vue 等框架的拦截
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

    // 对于 React，需要先设置 _valueTracker
    const tracker = input._valueTracker;
    if (tracker) {
      tracker.setValue('');
    }

    // 设置值
    nativeInputValueSetter.call(input, value);

    // 对于 React
    if (tracker) {
      tracker.setValue(value);
    }

    // 触发 input 事件
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value
    }));

    // 触发 change 事件
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    // 对于 Vue.js，触发 compositionend 事件
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));

    // 失去焦点
    input.blur();

    // 等待一小段时间确保值已设置
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证是否填写成功
    if (input.value !== value) {
      // 重试：直接设置值
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return input.value === value;
  }

  /**
   * 专门处理 jaccount 验证码
   * 修复：排除 64x64 图标，处理 src 为空的情况，确保使用最新图片
   */
  async function handleJaccountCaptcha() {
    console.log('[Captcha Auto-Fill] 处理 jaccount 验证码');

    // 首先尝试从 storage 重新读取账号设置（确保最新）
    try {
      const settings = await chrome.storage.sync.get(['autoFillCredentials', 'jaccountUser', 'jaccountPass', 'oneClickLogin']);
      autoFillCredentials = settings.autoFillCredentials === true;
      jaccountUser = settings.jaccountUser || '';
      jaccountPass = settings.jaccountPass || '';
      oneClickLoginEnabled = settings.oneClickLogin === true;
      console.log('[Captcha Auto-Fill] 重新读取账号设置:', {
        autoFillCredentials,
        hasUser: !!jaccountUser,
        hasPass: !!jaccountPass,
        oneClickLoginEnabled
      });
    } catch (e) {
      console.warn('[Captcha Auto-Fill] 读取设置失败:', e);
    }

    // 首先尝试自动填充账号密码
    await fillCredentials();

    // jaccount 验证码图片选择器 - 直接选择 img#captcha-img
    // 关键修复：每次重新查询 DOM，确保获取最新的 img 元素
    let captchaImg = document.querySelector('img#captcha-img');

    if (!captchaImg) {
      console.log('[Captcha Auto-Fill] 未找到 jaccount 验证码图片');
      return;
    }

    // 检查是否是 64x64 占位图标
    let width = captchaImg.naturalWidth || captchaImg.width;
    let height = captchaImg.naturalHeight || captchaImg.height;

    if (width === 64 && height === 64) {
      console.log('[Captcha Auto-Fill] 检测到 64x64 占位图标，尝试刷新验证码');
      triggerCaptchaRefresh();
      // 延迟后重试
      setTimeout(() => handleJaccountCaptcha(), 800);
      return;
    }

    // 检查 src 是否有效
    if (!captchaImg.src ||
        captchaImg.src === window.location.href ||
        captchaImg.src.includes('image/captcha.png')) {
      console.log('[Captcha Auto-Fill] 验证码图片 src 无效，尝试刷新');
      triggerCaptchaRefresh();
      setTimeout(() => handleJaccountCaptcha(), 800);
      return;
    }

    console.log('[Captcha Auto-Fill] 找到 jaccount 验证码图片:', captchaImg.src.substring(captchaImg.src.lastIndexOf('/') + 1));

    // 使用增强的查找逻辑找到验证码输入框
    const captchaInput = findRelatedInput(captchaImg);

    if (!captchaInput) {
      console.warn('[Captcha Auto-Fill] 未找到验证码输入框');
      return;
    }

    console.log('[Captcha Auto-Fill] 找到验证码输入框:', captchaInput);
    console.log('[Captcha Auto-Fill] 输入框属性 - id:', captchaInput.id, 'name:', captchaInput.name, 'placeholder:', captchaInput.placeholder);

    // 等待图片加载完成
    if (!captchaImg.complete) {
      console.log('[Captcha Auto-Fill] 等待验证码图片加载...');
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          console.warn('[Captcha Auto-Fill] 图片加载超时');
          resolve();
        }, 3000);

        captchaImg.onload = () => {
          clearTimeout(timeout);
          resolve();
        };
        captchaImg.onerror = () => {
          clearTimeout(timeout);
          console.warn('[Captcha Auto-Fill] 图片加载失败');
          resolve();
        };
      });
    }

    // 关键修复：在 processCaptcha 前重新查询 DOM，确保使用最新的 img 元素
    // 这是为了防止在等待期间图片已经被刷新
    captchaImg = document.querySelector('img#captcha-img');
    if (!captchaImg) {
      console.warn('[Captcha Auto-Fill] 重新查询后未找到验证码图片');
      return;
    }

    // 再次检查尺寸
    const finalWidth = captchaImg.naturalWidth || captchaImg.width;
    const finalHeight = captchaImg.naturalHeight || captchaImg.height;
    if (finalWidth === 64 && finalHeight === 64) {
      console.warn('[Captcha Auto-Fill] 加载完成后仍是 64x64 图标，跳过处理');
      return;
    }

    console.log('[Captcha Auto-Fill] 最终使用验证码图片:', captchaImg.src.substring(captchaImg.src.lastIndexOf('/') + 1));

    await processCaptcha({
      element: captchaImg,
      score: 1.0,
      src: captchaImg.src
    }, captchaInput);
  }

  /**
   * 监听DOM变化
   */
  function observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
      if (!isEnabled || isProcessing) return;

      let shouldCheck = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'IMG' || node.querySelector('img')) {
                shouldCheck = true;
                break;
              }
            }
          }
        }
      }

      if (shouldCheck) {
        // 防抖处理
        clearTimeout(window.captchaCheckTimeout);
        window.captchaCheckTimeout = setTimeout(() => {
          const captchas = findCaptchaImages();
          if (captchas.length > 0) {
            processCaptcha(captchas[0]);
          }
        }, 300);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /**
   * 一键登录处理
   * 1. 识别并填写验证码
   * 2. 点击登录按钮
   * 3. 登录失败时自动重试，最多重试 MAX_LOGIN_RETRIES 次
   */
  async function handleOneClickLogin() {
    console.log('[Captcha Auto-Fill] 开始一键登录');
    showNotification('开始一键登录...', 'info');

    // 重置重试计数器（新的一次性登录流程）
    loginRetryCount = 0;
    isOneClickLoginMode = true;

    // 先确保验证码已识别
    if (!recognizedCaptcha || !recognizedCaptcha.text) {
      // 尝试识别验证码
      const captchas = findCaptchaImages();
      if (captchas.length > 0) {
        await processCaptcha(captchas[0]);
      } else if (window.location.href.includes('jaccount.sjtu.edu.cn')) {
        await handleJaccountCaptcha();
      }
    }

    // 等待识别完成
    let waitCount = 0;
    while ((!recognizedCaptcha || !recognizedCaptcha.text) && waitCount < 15) {
      await new Promise(resolve => setTimeout(resolve, 300));
      waitCount++;
    }

    if (!recognizedCaptcha || !recognizedCaptcha.text) {
      isOneClickLoginMode = false;
      showNotification('验证码识别失败', 'error');
      return { success: false, message: '验证码识别失败' };
    }

    // 查找登录按钮
    const loginBtn = findLoginButton();
    if (!loginBtn) {
      isOneClickLoginMode = false;
      showNotification('未找到登录按钮', 'error');
      return { success: false, message: '未找到登录按钮' };
    }

    // 开始监听登录结果（失败时自动重试）
    startLoginFailureMonitor();

    // 点击登录按钮
    console.log('[Captcha Auto-Fill] 点击登录按钮');
    showNotification('正在提交登录...', 'info');
    loginBtn.click();

    return { success: true, message: '已提交登录' };
  }

  /**
   * 查找登录按钮
   */
  function findLoginButton() {
    // jaccount 特定选择器
    if (window.location.href.includes('jaccount.sjtu.edu.cn')) {
      console.log('[Captcha Auto-Fill] 开始查找 jaccount 登录按钮');

      // 关键修复：优先精确查找密码登录按钮
      const passwordBtn = document.querySelector('#submit-password-button');
      if (passwordBtn) {
        console.log('[Captcha Auto-Fill] 找到密码登录按钮:', passwordBtn.id);
        return passwordBtn;
      }

      // 如果没找到，尝试查找其他可能的登录按钮（排除短信验证码按钮）
      const possibleBtns = document.querySelectorAll('input[type="submit"], button[type="submit"]');
      console.log('[Captcha Auto-Fill] 找到', possibleBtns.length, '个可能的提交按钮');

      for (const btn of possibleBtns) {
        // 排除短信验证码按钮
        if (btn.id && (btn.id.includes('sms') || btn.id.includes('SMS'))) {
          console.log('[Captcha Auto-Fill] 跳过短信按钮:', btn.id);
          continue;
        }

        // 检查按钮是否在密码登录表单中（通过检查父元素或相邻元素）
        const form = btn.closest('form');
        const hasPasswordField = form && form.querySelector('input[type="password"]');

        if (hasPasswordField) {
          console.log('[Captcha Auto-Fill] 找到密码表单中的登录按钮:', btn.id || btn.className);
          return btn;
        }
      }

      console.warn('[Captcha Auto-Fill] 未找到 jaccount 登录按钮');
    }

    // 通用登录按钮检测
    const possibleButtons = document.querySelectorAll('button, input[type="submit"], a.btn');

    for (const btn of possibleButtons) {
      const text = (btn.textContent || btn.value || '').toLowerCase();

      // 根据文本内容匹配
      if (text.includes('登录') ||
          text.includes('login') ||
          text.includes('提交') ||
          text.includes('submit') ||
          text.includes('sign in') ||
          text.includes('signin')) {
        return btn;
      }

      // 根据类型匹配
      if (btn.type === 'submit') {
        return btn;
      }
    }

    // 兜底：找表单内的 submit 按钮
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn) return submitBtn;
    }

    return null;
  }

  /**
   * 启动登录结果监听器
   * 登录失败时自动重试，最多重试 MAX_LOGIN_RETRIES 次
   */
  function startLoginFailureMonitor() {
    console.log('[Captcha Auto-Fill] 启动登录失败监听，当前重试次数:', loginRetryCount);

    // 记录初始错误状态，避免检测到点击前就已存在的错误
    const initialErrorInfo = detectLoginError();
    const hadInitialError = initialErrorInfo.hasError;
    if (hadInitialError) {
      console.log('[Captcha Auto-Fill] 检测到页面已有错误提示，将忽略:', initialErrorInfo.message);
    }

    let lastErrorMessage = hadInitialError ? initialErrorInfo.message : null;
    let retryScheduled = false;  // 防止重复调度重试

    // 使用 MutationObserver 监听页面变化
    const observer = new MutationObserver((mutations) => {
      if (!isOneClickLoginMode) {
        observer.disconnect();
        return;
      }

      // 检查是否有错误提示
      const errorInfo = detectLoginError();
      if (errorInfo.hasError) {
        // 关键修复：如果错误信息与之前相同，说明不是新错误，忽略
        if (errorInfo.message === lastErrorMessage) {
          console.log('[Captcha Auto-Fill] 忽略重复的错误提示:', errorInfo.message);
          return;
        }

        // 更新最后错误消息
        lastErrorMessage = errorInfo.message;

        console.log('[Captcha Auto-Fill] 检测到登录错误:', errorInfo.message);
        console.log('[Captcha Auto-Fill] 是否是验证码错误:', errorInfo.isCaptchaError);
        console.log('[Captcha Auto-Fill] 当前重试次数:', loginRetryCount, '最大重试次数:', MAX_LOGIN_RETRIES);

        // 停止当前监听
        observer.disconnect();
        isOneClickLoginMode = false;
        autoLoginTriggered = false;

        // 检查是否需要重试
        if (loginRetryCount < MAX_LOGIN_RETRIES) {
          if (!retryScheduled) {
            retryScheduled = true;
            loginRetryCount++;
            console.log(`[Captcha Auto-Fill] 登录失败，准备第 ${loginRetryCount} 次重试...`);
            showNotification(`登录失败，正在第 ${loginRetryCount} 次重试...`, 'warning');

            // 延迟后重试
            setTimeout(async () => {
              await retryLogin();
            }, 800);
          }
        } else {
          console.log('[Captcha Auto-Fill] 已达到最大重试次数，停止自动重试');
          showNotification('登录失败次数过多，请手动检查账号密码', 'error');
          // 重置重试计数器，允许下次手动触发
          loginRetryCount = 0;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // 5秒后自动停止监听
    setTimeout(() => {
      if (isOneClickLoginMode) {
        observer.disconnect();
        isOneClickLoginMode = false;
        autoLoginTriggered = false;
        // 登录成功或超时，重置重试计数器
        loginRetryCount = 0;
        console.log('[Captcha Auto-Fill] 登录监听超时结束，重置重试计数器');
      }
    }, 5000);
  }

  /**
   * 重试登录
   * 刷新验证码并重新识别、填写、提交
   */
  async function retryLogin() {
    console.log('[Captcha Auto-Fill] 开始重试登录流程');

    // 重置状态
    recognizedCaptcha = null;
    isProcessing = false;

    // 刷新验证码
    triggerCaptchaRefresh();
    showNotification('正在刷新验证码...', 'info');

    // 等待验证码刷新
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 重新检测并识别验证码
    if (window.location.href.includes('jaccount.sjtu.edu.cn')) {
      await handleJaccountCaptcha();
    } else {
      const captchas = findCaptchaImages();
      if (captchas.length > 0) {
        await processCaptcha(captchas[0]);
      }
    }

    // 等待识别完成
    let waitCount = 0;
    while ((!recognizedCaptcha || !recognizedCaptcha.text) && waitCount < 15) {
      await new Promise(resolve => setTimeout(resolve, 300));
      waitCount++;
    }

    if (!recognizedCaptcha || !recognizedCaptcha.text) {
      console.warn('[Captcha Auto-Fill] 重试时验证码识别失败');
      showNotification('验证码识别失败，请手动刷新', 'error');
      return;
    }

    console.log('[Captcha Auto-Fill] 重试时验证码识别成功:', recognizedCaptcha.text);

    // 重新点击登录按钮
    await autoClickLoginButton();
  }

  /**
   * 检测登录错误
   */
  function detectLoginError() {
    const result = { hasError: false, isCaptchaError: false, message: '' };

    // jaccount 特定错误检测 - 优先使用精确的选择器
    if (window.location.href.includes('jaccount.sjtu.edu.cn')) {
      // jaccount 使用 #div_warn 显示错误，检查它是否可见且有内容
      const warnDiv = document.getElementById('div_warn');
      if (warnDiv) {
        const style = window.getComputedStyle(warnDiv);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        const warnSpan = document.getElementById('span_warn');
        const text = (warnSpan ? warnSpan.textContent : warnDiv.textContent) || '';

        if (isVisible && text.trim().length > 0) {
          result.hasError = true;
          result.message = text.toLowerCase();

          // 判断是否是验证码错误
          if (result.message.includes('验证码') ||
              result.message.includes('captcha')) {
            result.isCaptchaError = true;
          }

          return result;
        }
      }
    }

    // 通用错误检测 - 只检查明确显示的错误提示
    const errorSelectors = [
      '.error-message:not(:empty)',
      '.alert-error:not(:empty)',
      '.alert-danger:not(:empty)',
      '.tips--danger:not(:empty)',
      '.el-message--error:not(:empty)'
    ];

    for (const selector of errorSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        const text = (el.textContent || '').trim();

        // 只处理可见且有文本的元素
        if (isVisible && text.length > 0) {
          const lowerText = text.toLowerCase();
          result.hasError = true;
          result.message = lowerText;

          // 判断是否是验证码错误
          if (lowerText.includes('验证码') ||
              lowerText.includes('captcha') ||
              lowerText.includes('verification') ||
              lowerText.includes('验证')) {
            result.isCaptchaError = true;
          }

          return result;
        }
      }
    }

    return result;
  }

  /**
   * 自动点击登录按钮（用于一键登录功能）
   */
  async function autoClickLoginButton() {
    console.log('[Captcha Auto-Fill] 自动点击登录按钮');

    const loginBtn = findLoginButton();
    if (!loginBtn) {
      console.warn('[Captcha Auto-Fill] 未找到登录按钮');
      return;
    }

    // 输出按钮详细信息用于调试
    console.log('[Captcha Auto-Fill] 登录按钮详情:', {
      id: loginBtn.id,
      type: loginBtn.type,
      tagName: loginBtn.tagName,
      className: loginBtn.className,
      value: loginBtn.value,
      disabled: loginBtn.disabled,
      visible: loginBtn.offsetParent !== null
    });

    // 检查按钮是否可见和可用
    if (loginBtn.disabled) {
      console.warn('[Captcha Auto-Fill] 登录按钮被禁用');
      return;
    }

    if (loginBtn.offsetParent === null) {
      console.warn('[Captcha Auto-Fill] 登录按钮不可见（可能在隐藏的元素中）');
      // 尝试滚动到按钮位置
      loginBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
      console.log('[Captcha Auto-Fill] 已滚动到按钮位置');
    }

    // 设置一键登录模式标志，重置重试计数器
    isOneClickLoginMode = true;
    loginRetryCount = 0;

    showNotification('正在自动登录...', 'info');

    // 关键修复：重新读取账号设置，确保有最新的凭据
    if (window.location.href.includes('jaccount.sjtu.edu.cn')) {
      try {
        const settings = await chrome.storage.sync.get(['autoFillCredentials', 'jaccountUser', 'jaccountPass']);
        autoFillCredentials = settings.autoFillCredentials === true;
        jaccountUser = settings.jaccountUser || '';
        jaccountPass = settings.jaccountPass || '';
        console.log('[Captcha Auto-Fill] 登录前重新读取账号设置:', {
          autoFillCredentials,
          hasUser: !!jaccountUser,
          hasPass: !!jaccountPass
        });
      } catch (e) {
        console.warn('[Captcha Auto-Fill] 读取设置失败:', e);
      }
    }

    // 关键修复：对于 jaccount，等待操作按钮区域显示
    if (window.location.href.includes('jaccount.sjtu.edu.cn')) {
      const operateButtons = document.getElementById('operate-buttons');
      if (operateButtons) {
        const style = window.getComputedStyle(operateButtons);
        if (style.display === 'none') {
          console.log('[Captcha Auto-Fill] 等待操作按钮区域显示...');
          // 等待最多 1 秒
          let waitCount = 0;
          while (style.display === 'none' && waitCount < 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
          }
          console.log('[Captcha Auto-Fill] 操作按钮区域已显示或超时');
        }
      }
    }

    // 延迟点击，确保验证码完全同步到表单
    await new Promise(resolve => setTimeout(resolve, 500));

    // 启动失败监听（在点击前启动，确保能捕获错误）
    startLoginFailureMonitor();

    // 短暂延迟，让监听器先准备好
    await new Promise(resolve => setTimeout(resolve, 100));

    // 点击登录按钮
    console.log('[Captcha Auto-Fill] 执行点击登录按钮');

    // 尝试多种点击方式，确保触发登录
    try {
      // 对于 jaccount，优先直接调用 checkForm 函数
      const isJaccount = window.location.href.includes('jaccount.sjtu.edu.cn');
      console.log('[Captcha Auto-Fill] 是否是 jaccount 页面:', isJaccount, 'URL:', window.location.href);

      if (isJaccount) {
        // 关键修复：设置 captchaCheckStatus 为 'passed'，避免 checkForm 中的验证拦截
        if (typeof window.captchaCheckStatus !== 'undefined') {
          console.log('[Captcha Auto-Fill] 设置 captchaCheckStatus 为 passed');
          window.captchaCheckStatus = 'passed';
        }

        console.log('[Captcha Auto-Fill] checkForm 类型:', typeof window.checkForm);

        // 关键修复：直接构造并提交表单数据，绕过 checkForm
        console.log('[Captcha Auto-Fill] 使用 AJAX 直接提交登录请求');

        // 等待浏览器自动填充完成
        console.log('[Captcha Auto-Fill] 等待浏览器自动填充...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 获取表单数据 - 优先使用 jQuery（因为页面使用了 jQuery）
        let user = '', password = '', captcha = '';

        // 辅助函数：读取表单数据
        const readFormData = () => {
          // 直接使用原生 DOM API 读取，避免 jQuery 可能的选择器问题
          const userInput = document.getElementById('input-login-user');
          const passInput = document.getElementById('input-login-pass');
          const captchaInput = document.getElementById('input-login-captcha');

          // 优先使用原生 value 属性
          user = userInput?.value || '';
          password = passInput?.value || '';
          captcha = captchaInput?.value || '';

          // 如果原生值为空，尝试使用 jQuery（页面可能使用了 jQuery 的 val() 方法）
          if ((!user || !password || !captcha) && typeof window.jQuery !== 'undefined') {
            const $ = window.jQuery;
            if (!user) user = $('#input-login-user').val() || '';
            if (!password) password = $('#input-login-pass').val() || '';
            if (!captcha) captcha = $('#input-login-captcha').val() || '';
          }

          console.log('[Captcha Auto-Fill] 读取到的原始值:', {
            user: user || '空',
            pass: password ? '有值' : '空',
            captcha: captcha || '空'
          });
        };

        readFormData();
        console.log('[Captcha Auto-Fill] 首次读取表单数据:', { user: user || '未填写', password: password ? '已填写' : '未填写', captcha: captcha || '空' });

        // 如果用户名或密码为空，尝试使用保存的凭据填充
        if (!user || !password) {
          console.log('[Captcha Auto-Fill] 表单为空，检查保存的凭据:', {
            hasSavedUser: !!jaccountUser,
            hasSavedPass: !!jaccountPass
          });

          if (jaccountUser && jaccountPass) {
            console.log('[Captcha Auto-Fill] 尝试使用保存的凭据填充');
            const filled = await fillCredentials();
            console.log('[Captcha Auto-Fill] 凭据填充结果:', filled);

            // 重新读取表单数据
            await new Promise(resolve => setTimeout(resolve, 300));
            readFormData();
            console.log('[Captcha Auto-Fill] 填充后读取表单数据:', { user: user || '未填写', password: password ? '已填写' : '未填写', captcha: captcha || '空' });
          } else {
            console.log('[Captcha Auto-Fill] 没有保存的凭据可用');
          }
        } else {
          console.log('[Captcha Auto-Fill] 表单已有数据，跳过填充');
        }

        // 关键：确保验证码已正确读取
        if (!captcha) {
          console.warn('[Captcha Auto-Fill] 验证码为空，尝试重新读取');
          readFormData();
          console.log('[Captcha Auto-Fill] 重新读取后验证码:', captcha || '仍为空');
        }

        console.log('[Captcha Auto-Fill] 最终表单数据:', { user: user || '未填写', password: password ? '已填写' : '未填写', captcha: captcha || '空', captchaLength: captcha?.length });

        if (!user || !password) {
          console.warn('[Captcha Auto-Fill] 用户名或密码未填写，无法自动登录');
          showNotification('请先填写用户名和密码', 'error');
          return;
        }

        // 构造登录参数
        const params = new URLSearchParams(window.location.search);
        const loginData = {
          sid: params.get('sid') || 'jasjtumail',
          client: '',
          returl: params.get('returl') || '',
          se: params.get('se') || '',
          v: '',
          uuid: document.querySelector('input[name="uuid"]')?.value || '',
          user: user,
          pass: password,
          captcha: captcha,
          lt: 'p'
        };

        console.log('[Captcha Auto-Fill] 准备提交登录请求，数据:', { ...loginData, pass: '***隐藏***' });

        // 方案1：尝试直接点击登录按钮（模拟用户点击）
        console.log('[Captcha Auto-Fill] 尝试方案1：直接点击登录按钮');
        const passwordBtn = document.getElementById('submit-password-button');
        console.log('[Captcha Auto-Fill] 登录按钮状态:', {
          found: !!passwordBtn,
          disabled: passwordBtn?.disabled,
          visible: passwordBtn?.offsetParent !== null
        });

        if (passwordBtn && !passwordBtn.disabled) {
          // 设置 captchaCheckStatus 为 passed，避免 checkForm 拦截
          if (typeof window.captchaCheckStatus !== 'undefined') {
            window.captchaCheckStatus = 'passed';
            console.log('[Captcha Auto-Fill] 已设置 captchaCheckStatus = passed');
          }

          // 滚动到按钮位置并聚焦
          passwordBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
          passwordBtn.focus();

          // 触发点击
          console.log('[Captcha Auto-Fill] 即将点击登录按钮...');
          passwordBtn.click();
          console.log('[Captcha Auto-Fill] 已点击登录按钮');

          // 等待页面跳转或错误提示
          setTimeout(() => {
            // 检查是否还在登录页面（说明可能登录失败）
            if (window.location.href.includes('jaccount.sjtu.edu.cn/jaccount/jalogin')) {
              console.warn('[Captcha Auto-Fill] 仍在登录页面，可能登录失败');
              const warnDiv = document.getElementById('div_warn');
              if (warnDiv && warnDiv.style.display !== 'none') {
                const errorText = document.getElementById('span_warn')?.textContent;
                console.error('[Captcha Auto-Fill] 登录错误:', errorText);
              }
            }
          }, 2000);

          return;
        }

        // 方案2：如果按钮点击失败，使用 AJAX 提交（备用方案）
        console.log('[Captcha Auto-Fill] 方案1不可用，尝试方案2：AJAX提交');

        // 使用 fetch 提交登录请求
        fetch('https://jaccount.sjtu.edu.cn/jaccount/ulogin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': window.location.href
          },
          body: new URLSearchParams(loginData),
          credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
          console.log('[Captcha Auto-Fill] 登录响应:', data);
          if (data.errno === 0 && data.url) {
            console.log('[Captcha Auto-Fill] 登录成功，跳转到:', data.url);
            window.location.href = data.url;
          } else {
            console.error('[Captcha Auto-Fill] 登录失败:', data.error);
            showNotification(data.error || '登录失败', 'error');
            // 刷新验证码
            if (typeof window.refreshCaptcha === 'function') {
              window.refreshCaptcha();
            }
          }
        })
        .catch(error => {
          console.error('[Captcha Auto-Fill] 登录请求失败:', error);
          showNotification('登录请求失败', 'error');
        });

        return;  // 直接返回，不再执行后续点击逻辑
      }

      // 方式1：直接调用 click()
      loginBtn.click();
      console.log('[Captcha Auto-Fill] 已执行 click()');

      // 方式2：触发 mousedown 和 mouseup 事件（某些表单需要）
      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      const mouseupEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });

      loginBtn.dispatchEvent(mousedownEvent);
      await new Promise(resolve => setTimeout(resolve, 50));
      loginBtn.dispatchEvent(mouseupEvent);
      await new Promise(resolve => setTimeout(resolve, 50));
      loginBtn.dispatchEvent(clickEvent);
      console.log('[Captcha Auto-Fill] 已执行 MouseEvent 点击');

      // 如果上述方式都失败，尝试直接提交表单
      if (window.location.href.includes('jaccount.sjtu.edu.cn')) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (typeof window.checkForm === 'function') {
          console.log('[Captcha Auto-Fill] checkForm 函数不存在，尝试提交表单');
          const form = loginBtn.closest('form');
          if (form) {
            form.submit();
            console.log('[Captcha Auto-Fill] 已提交表单');
          }
        }
      }
    } catch (error) {
      console.error('[Captcha Auto-Fill] 点击登录按钮时出错:', error);
    }
  }

  /**
   * 加载引擎配置和账号设置
   */
  async function loadEngineConfig(engine) {
    const keys = [
      'selectedModel',
      'kimiApiKey',
      'openaiApiKey',
      'claudeApiKey',
      'geminiApiKey',
      'baiduApiKey',
      'baiduSecretKey',
      'aliyunAccessKey',
      'aliyunAccessSecret',
      'autoFillCredentials',
      'jaccountUser',
      'jaccountPass'
    ];
    const settings = await chrome.storage.sync.get(keys);

    // 更新账号设置
    autoFillCredentials = settings.autoFillCredentials === true;
    jaccountUser = settings.jaccountUser || '';
    jaccountPass = settings.jaccountPass || '';

    switch (engine) {
      case 'kimi':
        return { apiKey: settings.kimiApiKey, model: settings.selectedModel };
      case 'openai':
        return { apiKey: settings.openaiApiKey, model: settings.selectedModel };
      case 'claude':
        return { apiKey: settings.claudeApiKey, model: settings.selectedModel };
      case 'gemini':
        return { apiKey: settings.geminiApiKey, model: settings.selectedModel };
      case 'baidu':
        return { apiKey: settings.baiduApiKey, secretKey: settings.baiduSecretKey };
      case 'aliyun':
        return { accessKey: settings.aliyunAccessKey, accessSecret: settings.aliyunAccessSecret };
      default:
        return {};
    }
  }
})();
