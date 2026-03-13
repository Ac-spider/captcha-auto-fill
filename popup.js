/**
 * 弹出窗口脚本
 * 处理用户界面交互
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM元素
  const toggleSwitch = document.getElementById('toggleSwitch');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const resultDisplay = document.getElementById('resultDisplay');
  const confidenceFill = document.getElementById('confidenceFill');
  const confidenceText = document.getElementById('confidenceText');
  const manualRecognizeBtn = document.getElementById('manualRecognizeBtn');
  const oneClickLoginCheck = document.getElementById('oneClickLoginCheck');
  const soundCheck = document.getElementById('soundCheck');
  const engineSelect = document.getElementById('engineSelect');
  const engineHint = document.getElementById('engineHint');

  // 新增元素
  const modelSelectSection = document.getElementById('modelSelectSection');
  const modelSelect = document.getElementById('modelSelect');
  const apiKeyInputSection = document.getElementById('apiKeyInputSection');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiSecretInput = document.getElementById('apiSecretInput');
  const apiKeyLabel = document.getElementById('apiKeyLabel');
  const apiKeyHint = document.getElementById('apiKeyHint');
  const apiKeyLink = document.getElementById('apiKeyLink');

  // 当前识别的验证码
  let currentCaptcha = null;

  // 引擎配置
  const engineConfigs = {
    local: {
      hint: '使用本地 ddddocr 服务，准确率高，需要启动本地服务器',
      needKey: false,
      models: null
    },
    kimi: {
      hint: '使用 Moonshot Kimi 视觉大模型',
      needKey: true,
      keyName: 'kimiApiKey',
      keyLabel: 'Kimi API Key',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      link: 'https://platform.moonshot.cn/',
      models: [
        { value: 'kimi-k2.5', label: 'Kimi K2.5 (推荐)' }
      ],
      defaultModel: 'kimi-k2.5'
    },
    openai: {
      hint: '使用 OpenAI GPT-4 Vision 模型',
      needKey: true,
      keyName: 'openaiApiKey',
      keyLabel: 'OpenAI API Key',
      keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
      link: 'https://platform.openai.com/',
      models: [
        { value: 'gpt-4o', label: 'GPT-4o (推荐)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (便宜)' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' }
      ],
      defaultModel: 'gpt-4o'
    },
    claude: {
      hint: '使用 Anthropic Claude 3 视觉模型',
      needKey: true,
      keyName: 'claudeApiKey',
      keyLabel: 'Claude API Key',
      keyPlaceholder: 'sk-ant-xxxxxxxxxxxxxxxx',
      link: 'https://console.anthropic.com/',
      models: [
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (最强)' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet (推荐)' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (最快)' }
      ],
      defaultModel: 'claude-3-sonnet-20240229'
    },
    gemini: {
      hint: '使用 Google Gemini Pro Vision 模型',
      needKey: true,
      keyName: 'geminiApiKey',
      keyLabel: 'Gemini API Key',
      keyPlaceholder: 'xxxxxxxxxxxxxxxx',
      link: 'https://ai.google.dev/',
      models: [
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (推荐)' },
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (最强)' }
      ],
      defaultModel: 'gemini-1.5-flash'
    },
    baidu: {
      hint: '使用百度智能云 OCR 服务，国内访问快',
      needKey: true,
      keyName: 'baiduApiKey',
      keyLabel: '百度 API Key',
      keyPlaceholder: '输入 API Key',
      secretName: 'baiduSecretKey',
      secretLabel: 'Secret Key',
      link: 'https://cloud.baidu.com/doc/OCR/index.html',
      models: null,
      needSecret: true
    },
    aliyun: {
      hint: '使用阿里云 OCR 服务，国内访问快',
      needKey: true,
      keyName: 'aliyunAccessKey',
      keyLabel: 'Access Key ID',
      keyPlaceholder: '输入 Access Key ID',
      secretName: 'aliyunAccessSecret',
      secretLabel: 'Access Key Secret',
      link: 'https://www.aliyun.com/product/ocr',
      models: null,
      needSecret: true
    },
    online: {
      hint: '使用 ocr.space 免费在线 OCR 服务',
      needKey: false,
      models: null
    }
  };

  /**
   * 初始化
   */
  async function init() {
    // 加载设置
    const settings = await chrome.storage.sync.get([
      'enabled',
      'oneClickLogin',
      'soundEnabled',
      'recognitionEngine',
      'selectedModel',
      'kimiApiKey',
      'openaiApiKey',
      'claudeApiKey',
      'geminiApiKey',
      'baiduApiKey',
      'baiduSecretKey',
      'aliyunAccessKey',
      'aliyunAccessSecret'
    ]);

    toggleSwitch.checked = settings.enabled !== false;
    oneClickLoginCheck.checked = settings.oneClickLogin === true;
    soundCheck.checked = settings.soundEnabled !== false;

    // 设置识别引擎
    const engine = settings.recognitionEngine || 'local';
    engineSelect.value = engine;
    updateUIForEngine(engine);

    // 恢复模型选择
    if (settings.selectedModel) {
      modelSelect.value = settings.selectedModel;
    }

    // 恢复 API Key
    restoreApiKeys(settings);

    updateStatusUI(toggleSwitch.checked);
    await refreshStatus();
  }

  /**
   * 恢复 API Keys
   */
  function restoreApiKeys(settings) {
    const engine = engineSelect.value;
    const config = engineConfigs[engine];
    if (!config || !config.needKey) return;

    if (settings[config.keyName]) {
      apiKeyInput.value = settings[config.keyName];
    }
    if (config.needSecret && settings[config.secretName]) {
      apiSecretInput.value = settings[config.secretName];
    }
  }

  /**
   * 根据引擎更新 UI
   */
  function updateUIForEngine(engine) {
    const config = engineConfigs[engine];
    if (!config) return;

    // 更新提示
    engineHint.textContent = config.hint;

    // 处理模型选择
    if (config.models) {
      modelSelectSection.style.display = 'block';
      // 填充模型选项
      modelSelect.innerHTML = config.models.map(m =>
        `<option value="${m.value}">${m.label}</option>`
      ).join('');
      // 恢复默认选择
      modelSelect.value = config.defaultModel;
    } else {
      modelSelectSection.style.display = 'none';
    }

    // 处理 API Key 输入
    if (config.needKey) {
      apiKeyInputSection.style.display = 'block';
      apiKeyLabel.textContent = config.keyLabel;
      apiKeyInput.placeholder = config.keyPlaceholder;
      apiKeyLink.href = config.link;

      // 是否需要 Secret Key
      if (config.needSecret) {
        apiSecretInput.style.display = 'block';
        apiSecretInput.placeholder = config.secretLabel;
      } else {
        apiSecretInput.style.display = 'none';
      }

      // 恢复保存的值
      chrome.storage.sync.get(config.keyName).then(result => {
        if (result[config.keyName]) {
          apiKeyInput.value = result[config.keyName];
        }
      });
      if (config.needSecret) {
        chrome.storage.sync.get(config.secretName).then(result => {
          if (result[config.secretName]) {
            apiSecretInput.value = result[config.secretName];
          }
        });
      }
    } else {
      apiKeyInputSection.style.display = 'none';
    }
  }

  /**
   * 更新状态UI
   */
  function updateStatusUI(enabled) {
    if (enabled) {
      statusIndicator.classList.remove('disabled');
      statusIndicator.classList.add('enabled');
      statusText.textContent = '已启用';
    } else {
      statusIndicator.classList.remove('enabled');
      statusIndicator.classList.add('disabled');
      statusText.textContent = '已禁用';
    }
  }

  /**
   * 刷新状态
   */
  async function refreshStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });

        if (response) {
          toggleSwitch.checked = response.enabled;
          updateStatusUI(response.enabled);

          if (response.recognizedCaptcha) {
            displayResult(response.recognizedCaptcha);
          }
        }
      }
    } catch (error) {
      console.log('无法与内容脚本通信:', error);
      resultDisplay.innerHTML = '<span class="no-result">请在包含验证码的页面使用</span>';
    }
  }

  /**
   * 显示识别结果
   */
  function displayResult(result) {
    currentCaptcha = result;

    if (result.text) {
      resultDisplay.innerHTML = `<span class="result-text">${escapeHtml(result.text)}</span>`;

      // 更新置信度条
      const confidence = result.confidence || 0;
      confidenceFill.style.width = `${confidence}%`;
      confidenceText.textContent = `置信度: ${confidence.toFixed(1)}%`;

      // 根据置信度设置颜色
      if (confidence >= 80) {
        confidenceFill.className = 'confidence-fill high';
      } else if (confidence >= 50) {
        confidenceFill.className = 'confidence-fill medium';
      } else {
        confidenceFill.className = 'confidence-fill low';
      }
    } else {
      resultDisplay.innerHTML = '<span class="no-result">识别失败</span>';
      confidenceFill.style.width = '0%';
      confidenceText.textContent = '';
    }
  }

  /**
   * HTML转义
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 播放提示音
   */
  function playNotificationSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  }

  // 事件监听

  // 开关切换
  toggleSwitch.addEventListener('change', async () => {
    const enabled = toggleSwitch.checked;
    updateStatusUI(enabled);

    await chrome.storage.sync.set({ enabled });

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, { action: 'toggle', enabled });
      }
    } catch (error) {
      console.log('无法与内容脚本通信:', error);
    }
  });

  // 手动识别按钮
  manualRecognizeBtn.addEventListener('click', async () => {
    manualRecognizeBtn.disabled = true;
    manualRecognizeBtn.innerHTML = '<span class="icon loading">⏳</span>识别中...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'manualRecognize' });

        if (response && response.success) {
          setTimeout(async () => {
            await refreshStatus();

            const settings = await chrome.storage.sync.get(['soundEnabled']);
            if (settings.soundEnabled !== false) {
              playNotificationSound();
            }
          }, 2000);
        } else {
          resultDisplay.innerHTML = '<span class="no-result">未找到验证码</span>';
        }
      }
    } catch (error) {
      console.error('手动识别失败:', error);
      resultDisplay.innerHTML = '<span class="no-result">识别出错</span>';
    } finally {
      manualRecognizeBtn.disabled = false;
      manualRecognizeBtn.innerHTML = '<span class="icon">🔍</span>手动识别';
    }
  });

  // 一键登录设置
  oneClickLoginCheck.addEventListener('change', async () => {
    await chrome.storage.sync.set({ oneClickLogin: oneClickLoginCheck.checked });

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'oneClickLoginChanged',
          enabled: oneClickLoginCheck.checked
        });
      }
    } catch (error) {
      console.log('无法与内容脚本通信:', error);
    }
  });

  // 提示音设置
  soundCheck.addEventListener('change', async () => {
    await chrome.storage.sync.set({ soundEnabled: soundCheck.checked });
  });

  // 识别引擎选择
  engineSelect.addEventListener('change', async () => {
    const engine = engineSelect.value;
    updateUIForEngine(engine);

    await chrome.storage.sync.set({ recognitionEngine: engine });

    // 通知内容脚本引擎已更改
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, { action: 'engineChanged', engine });
      }
    } catch (error) {
      console.log('无法与内容脚本通信:', error);
    }
  });

  // 模型选择
  modelSelect.addEventListener('change', async () => {
    await chrome.storage.sync.set({ selectedModel: modelSelect.value });
  });

  // API Key 输入防抖保存
  let apiKeyDebounceTimer;
  apiKeyInput.addEventListener('input', async () => {
    clearTimeout(apiKeyDebounceTimer);
    apiKeyDebounceTimer = setTimeout(async () => {
      const engine = engineSelect.value;
      const config = engineConfigs[engine];
      if (config && config.keyName) {
        await chrome.storage.sync.set({ [config.keyName]: apiKeyInput.value.trim() });
      }
    }, 500);
  });

  // Secret Key 输入防抖保存
  apiSecretInput.addEventListener('input', async () => {
    clearTimeout(apiKeyDebounceTimer);
    apiKeyDebounceTimer = setTimeout(async () => {
      const engine = engineSelect.value;
      const config = engineConfigs[engine];
      if (config && config.secretName) {
        await chrome.storage.sync.set({ [config.secretName]: apiSecretInput.value.trim() });
      }
    }, 500);
  });

  // 监听来自内容脚本的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'recognitionComplete') {
      displayResult(request.result);

      chrome.storage.sync.get(['soundEnabled'], (result) => {
        if (result.soundEnabled !== false) {
          playNotificationSound();
        }
      });
    }
    return true;
  });

  // 启动
  init();
});
