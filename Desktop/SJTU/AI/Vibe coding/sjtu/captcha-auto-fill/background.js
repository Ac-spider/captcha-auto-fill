/**
 * 后台服务工作者
 * 处理插件的后台任务和消息转发
 */

// 安装时初始化
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Captcha Auto-Fill] 插件已安装/更新');

  // 初始化默认设置
  chrome.storage.sync.set({
    enabled: true,
    autoSubmit: false,
    soundEnabled: true
  });

  // 安装提示（使用控制台日志代替通知，避免图标问题）
  if (details.reason === 'install') {
    console.log('[Captcha Auto-Fill] 验证码自动识别插件已安装，访问包含验证码的页面时，插件将自动检测并识别验证码。');
  }
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 页面加载完成时
  if (changeInfo.status === 'complete' && tab.url) {
    // 检查是否是jaccount页面
    if (tab.url.includes('jaccount.sjtu.edu.cn')) {
      console.log('[Captcha Auto-Fill] 检测到jaccount页面');

      // 可以在这里执行特定于jaccount的操作
      chrome.storage.sync.get(['enabled'], (result) => {
        if (result.enabled !== false) {
          // 可选：显示页面操作按钮
          chrome.action.setBadgeText({
            text: 'ON',
            tabId: tabId
          });
          chrome.action.setBadgeBackgroundColor({
            color: '#4CAF50',
            tabId: tabId
          });
        }
      });
    }
  }
});

// 监听来自内容脚本和popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'recognitionComplete':
      // 转发识别完成消息到popup
      chrome.runtime.sendMessage(request).catch(() => {
        // popup可能未打开，忽略错误
      });
      break;

    case 'getSettings':
      chrome.storage.sync.get(['enabled', 'autoSubmit', 'soundEnabled'], (result) => {
        sendResponse(result);
      });
      return true; // 保持消息通道开放

    case 'saveSettings':
      chrome.storage.sync.set(request.settings, () => {
        sendResponse({ success: true });
      });
      return true;

    case 'ocrRequest':
      // 代理 OCR 请求到本地服务（解决 HTTPS 页面无法访问 HTTP 的问题）
      console.log('[Background] 收到 OCR 请求');

      // 处理 OCR 请求：如果是 URL，先获取图片数据
      (async () => {
        try {
          let base64Image = request.image;

          // 如果不是 base64，说明是 URL，需要先获取图片
          if (!request.image.startsWith('data:')) {
            console.log('[Background] 检测到图片 URL，正在获取图片数据...');
            base64Image = await fetchImageAsBase64(request.image);
            console.log('[Background] 图片已转换为 base64，长度:', base64Image.length);
          }

          // 发送到 OCR 服务
          const response = await fetch('http://127.0.0.1:5000/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image })
          });

          console.log('[Background] OCR 服务响应状态:', response.status);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
          }

          const result = await response.json();
          console.log('[Background] OCR 识别结果:', result);
          sendResponse({ success: true, result });
        } catch (error) {
          console.error('[Background] OCR 请求失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 保持消息通道开放

    case 'downloadCaptcha':
      // 下载验证码图片功能已禁用
      console.log('[Background] 下载验证码功能已禁用');
      sendResponse({ success: false, error: '下载功能已禁用' });
      return;

      // 以下是原来的下载代码，已禁用
      // eslint-disable-next-line no-unreachable
      console.log('[Background] 收到下载验证码请求，引擎:', request.engine);

      (async () => {
        try {
          // 直接使用 content script 传来的 base64 数据
          // 不再重新获取，避免 session 不一致导致的 403 错误
          let base64Image = request.image;

          // 生成文件名 - 根据引擎类型保存到不同目录
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const domain = request.domain || 'unknown';
          const engine = request.engine || 'unknown';

          // 根据引擎类型选择保存目录
          let folderName;
          switch (engine) {
            case 'local':
              folderName = 'local_ocr_image';
              break;
            case 'kimi':
              folderName = 'kimi_ocr_image';
              break;
            case 'online':
              folderName = 'online_ocr_image';
              break;
            case 'algorithm':
              folderName = 'algorithm_ocr_image';
              break;
            default:
              folderName = 'captcha_images';
          }

          const filename = `${folderName}/${domain}_${timestamp}.png`;

          // 直接使用 base64 data URL 进行下载
          chrome.downloads.download({
            url: base64Image,
            filename: filename,
            saveAs: false
          }, (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error('[Background] 下载失败:', chrome.runtime.lastError);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              console.log(`[Background] 验证码图片已下载 [${engine}]:`, filename, '下载ID:', downloadId);
              sendResponse({ success: true, filename: filename, downloadId: downloadId });
            }
          });
        } catch (error) {
          console.error('[Background] 下载验证码失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 保持消息通道开放

    case 'kimiOcrRequest':
      // 代理 Kimi API 请求（解决 CORS 问题）
      console.log('[Background] 收到 Kimi OCR 请求');

      (async () => {
        try {
          const kimiApiUrl = 'https://api.moonshot.cn/v1/chat/completions';

          const response = await fetch(kimiApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${request.apiKey}`
            },
            body: JSON.stringify({
              model: request.model || 'kimi-k2.5',
              max_tokens: request.maxTokens || 500,
              messages: [{
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${request.base64Image}`
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

          console.log('[Background] Kimi API 响应状态:', response.status);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const data = await response.json();
          console.log('[Background] Kimi API 响应:', data);

          if (data.choices && data.choices.length > 0) {
            const text = data.choices[0].message.content.trim();
            // 清理结果，只保留字母数字
            const cleanedText = text.replace(/[^a-zA-Z0-9]/g, '');

            sendResponse({
              success: true,
              result: {
                text: cleanedText,
                confidence: cleanedText.length > 0 ? 95 : 0
              }
            });
          } else {
            sendResponse({
              success: false,
              error: 'Kimi API 返回结果为空'
            });
          }
        } catch (error) {
          console.error('[Background] Kimi API 请求失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'openaiOcrRequest':
      console.log('[Background] 收到 OpenAI OCR 请求');
      (async () => {
        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${request.apiKey}`
            },
            body: JSON.stringify({
              model: request.model || 'gpt-4o',
              max_tokens: request.maxTokens || 500,
              messages: [{
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${request.base64Image}`,
                      detail: 'low'
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

          console.log('[Background] OpenAI API 响应状态:', response.status);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const data = await response.json();
          if (data.choices && data.choices.length > 0) {
            const text = data.choices[0].message.content.trim();
            const cleanedText = text.replace(/[^a-zA-Z0-9]/g, '');
            sendResponse({ success: true, result: { text: cleanedText, confidence: cleanedText.length > 0 ? 95 : 0 } });
          } else {
            sendResponse({ success: false, error: 'OpenAI API 返回结果为空' });
          }
        } catch (error) {
          console.error('[Background] OpenAI API 请求失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'claudeOcrRequest':
      console.log('[Background] 收到 Claude OCR 请求');
      (async () => {
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': request.apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: request.model || 'claude-3-sonnet-20240229',
              max_tokens: request.maxTokens || 500,
              messages: [{
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/png',
                      data: request.base64Image
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

          console.log('[Background] Claude API 响应状态:', response.status);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const data = await response.json();
          if (data.content && data.content.length > 0) {
            const text = data.content[0].text.trim();
            const cleanedText = text.replace(/[^a-zA-Z0-9]/g, '');
            sendResponse({ success: true, result: { text: cleanedText, confidence: cleanedText.length > 0 ? 95 : 0 } });
          } else {
            sendResponse({ success: false, error: 'Claude API 返回结果为空' });
          }
        } catch (error) {
          console.error('[Background] Claude API 请求失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'geminiOcrRequest':
      console.log('[Background] 收到 Gemini OCR 请求');
      (async () => {
        try {
          const model = request.model || 'gemini-1.5-flash';
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${request.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: '识别图片中的验证码文字，只返回文字内容，不要任何解释。验证码通常由4-6位小写字母组成。' },
                  { inline_data: { mime_type: 'image/png', data: request.base64Image } }
                ]
              }]
            })
          });

          console.log('[Background] Gemini API 响应状态:', response.status);
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const data = await response.json();
          if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            const text = data.candidates[0].content.parts[0].text.trim();
            const cleanedText = text.replace(/[^a-zA-Z0-9]/g, '');
            sendResponse({ success: true, result: { text: cleanedText, confidence: cleanedText.length > 0 ? 95 : 0 } });
          } else {
            sendResponse({ success: false, error: 'Gemini API 返回结果为空' });
          }
        } catch (error) {
          console.error('[Background] Gemini API 请求失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'baiduOcrRequest':
      console.log('[Background] 收到百度 OCR 请求');
      (async () => {
        try {
          // 1. 获取 access token
          const tokenResponse = await fetch(`https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${request.apiKey}&client_secret=${request.secretKey}`, {
            method: 'POST'
          });
          const tokenData = await tokenResponse.json();
          if (!tokenData.access_token) {
            throw new Error('获取百度 access_token 失败');
          }

          // 2. 调用 OCR API
          const ocrResponse = await fetch(`https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${tokenData.access_token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `image=${encodeURIComponent(request.base64Image)}`
          });

          const data = await ocrResponse.json();
          if (data.words_result && data.words_result.length > 0) {
            const text = data.words_result[0].words.trim().replace(/[^a-zA-Z0-9]/g, '');
            sendResponse({ success: true, result: { text, confidence: data.words_result[0].probability?.average || 90 } });
          } else {
            sendResponse({ success: false, error: '百度 OCR 返回结果为空' });
          }
        } catch (error) {
          console.error('[Background] 百度 OCR 请求失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'aliyunOcrRequest':
      console.log('[Background] 收到阿里云 OCR 请求');
      (async () => {
        try {
          // 阿里云 OCR 需要签名，这里简化处理，直接返回错误提示用户使用其他方式
          sendResponse({ success: false, error: '阿里云 OCR 需要服务端签名，请使用本地 ddddocr 或其他 API' });
        } catch (error) {
          console.error('[Background] 阿里云 OCR 请求失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'downloadCaptchaForComparison':
      // 下载验证码图片功能已禁用
      console.log('[Background] 下载比对图片功能已禁用');
      sendResponse({ success: false, error: '下载功能已禁用' });
      return;

      // 以下是原来的下载代码，已禁用
      // eslint-disable-next-line no-unreachable
      console.log('[Background] 收到比对图片下载请求，引擎:', request.engine);

      (async () => {
        try {
          let base64Image = request.image;

          // 如果不是 base64，先获取图片
          if (!request.image.startsWith('data:')) {
            try {
              base64Image = await fetchImageAsBase64(request.image);
            } catch (e) {
              console.warn('[Background] 获取图片失败:', e);
              sendResponse({ success: false, error: '获取图片失败: ' + e.message });
              return;
            }
          }

          // 生成文件名
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const engine = request.engine || 'unknown';

          // 根据引擎类型选择保存目录
          let folderName;
          switch (engine) {
            case 'local':
              folderName = 'local_ocr_image';
              break;
            case 'kimi':
              folderName = 'kimi_ocr_image';
              break;
            case 'online':
              folderName = 'online_ocr_image';
              break;
            case 'algorithm':
              folderName = 'algorithm_ocr_image';
              break;
            default:
              folderName = 'captcha_images';
          }

          const filename = `${folderName}/captcha_${timestamp}.png`;

          chrome.downloads.download({
            url: base64Image,
            filename: filename,
            saveAs: false
          }, (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error('[Background] 下载失败:', chrome.runtime.lastError);
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              console.log(`[Background] 比对图片已下载 [${engine}]:`, filename);
              sendResponse({ success: true, filename: filename, downloadId: downloadId });
            }
          });
        } catch (error) {
          console.error('[Background] 下载比对图片失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'fetchImageAsBase64':
      // 获取图片并转换为 base64
      console.log('[Background] 收到获取图片请求:', request.imageUrl?.substring(0, 50));

      (async () => {
        try {
          const base64 = await fetchImageAsBase64(request.imageUrl);
          sendResponse({ success: true, base64: base64 });
        } catch (error) {
          console.error('[Background] 获取图片失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    default:
      break;
  }
});

// 点击插件图标时的处理
chrome.action.onClicked.addListener((tab) => {
  // 如果popup未定义，可以在这里处理点击事件
  console.log('[Captcha Auto-Fill] 插件图标被点击');
});

// 定期清理（可选）
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    // 执行清理任务
    console.log('[Captcha Auto-Fill] 执行定期清理');
  }
});

console.log('[Captcha Auto-Fill] 后台服务已启动');

/**
 * 监听键盘快捷键命令
 */
chrome.commands.onCommand.addListener((command, tab) => {
  console.log('[Captcha Auto-Fill] 收到快捷键命令:', command);

  if (command === 'manual-recognize') {
    // 向当前标签页发送手动识别消息
    chrome.tabs.sendMessage(tab.id, { action: 'manualRecognize' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Captcha Auto-Fill] 发送手动识别消息失败:', chrome.runtime.lastError.message);
      } else {
        console.log('[Captcha Auto-Fill] 手动识别已触发:', response);
      }
    });
  }
});

/**
 * 获取图片并转换为 base64
 * 在 background script 中使用 chrome.cookies API 获取页面的 cookies
 * 然后手动添加到 fetch 请求中
 */
async function fetchImageAsBase64(imageUrl) {
  // 添加时间戳避免缓存
  const url = imageUrl + (imageUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();

  console.log('[Background] 正在获取图片:', url.substring(0, 100) + '...');

  // 解析 URL 获取域名
  const urlObj = new URL(imageUrl);
  const domain = urlObj.hostname;
  const referer = `${urlObj.protocol}//${urlObj.host}/`;

  console.log('[Background] 域名:', domain);

  // 获取该域名的所有 cookies
  let cookieHeader = '';
  try {
    const cookies = await chrome.cookies.getAll({ domain: domain });
    console.log('[Background] 获取到的 cookies:', cookies.map(c => c.name).join(', '));

    if (cookies && cookies.length > 0) {
      cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      console.log('[Background] Cookie 头长度:', cookieHeader.length);
    }
  } catch (e) {
    console.warn('[Background] 获取 cookies 失败:', e);
  }

  // 准备请求头
  const headers = {
    'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': referer,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'same-origin'
  };

  // 如果获取到了 cookies，添加到请求头
  if (cookieHeader) {
    headers['Cookie'] = cookieHeader;
    console.log('[Background] 已添加 Cookie 头');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: headers
  });

  if (!response.ok) {
    throw new Error(`获取图片失败: HTTP ${response.status}`);
  }

  // 获取二进制数据
  const blob = await response.blob();
  console.log('[Background] 图片获取成功，类型:', blob.type, '大小:', blob.size);

  // 转换为 base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      console.log('[Background] 图片转 base64 成功，长度:', base64.length);
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('读取图片数据失败'));
    reader.readAsDataURL(blob);
  });
}
