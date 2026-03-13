@echo off
chcp 65001 >nul
echo ==========================================
echo  安装 OCR 服务到 Windows 系统服务
echo ==========================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 请以管理员身份运行此脚本！
    echo 右键点击此文件，选择"以管理员身份运行"
    pause
    exit /b 1
)

:: 设置路径
set "SCRIPT_DIR=%~dp0"
set "PYTHON_PATH=%USERPROFILE%\anaconda3\python.exe"
set "NSSM_PATH=%SCRIPT_DIR%nssm.exe"

:: 如果没有 anaconda，尝试找系统 Python
if not exist "%PYTHON_PATH%" (
    set "PYTHON_PATH=python.exe"
)

echo [信息] 使用 Python: %PYTHON_PATH%
echo [信息] 服务脚本: %SCRIPT_DIR%ocr_service.py

:: 检查 nssm 是否存在
if not exist "%NSSM_PATH%" (
    echo.
    echo [错误] 未找到 nssm.exe！
    echo 正在下载 nssm...

    :: 使用 PowerShell 下载 nssm
    powershell -Command "& {Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip'}"

    :: 解压
    powershell -Command "& {Expand-Archive -Path '%TEMP%\nssm.zip' -DestinationPath '%TEMP%\nssm' -Force}"

    :: 复制对应版本的 nssm
    if exist "%TEMP%\nssm\nssm-2.24\win64\nssm.exe" (
        copy "%TEMP%\nssm\nssm-2.24\win64\nssm.exe" "%NSSM_PATH%" >nul
    ) else (
        copy "%TEMP%\nssm\nssm-2.24\win32\nssm.exe" "%NSSM_PATH%" >nul
    )

    if exist "%NSSM_PATH%" (
        echo [成功] nssm 下载完成
    ) else (
        echo [错误] nssm 下载失败，请手动下载并放在此目录
        echo 下载地址: https://nssm.cc/download
        pause
        exit /b 1
    )
)

:: 先卸载旧服务（如果存在）
echo.
echo [信息] 检查并移除旧服务...
"%NSSM_PATH%" stop OCRCaptcha >nul 2>&1
"%NSSM_PATH%" remove OCRCaptcha confirm >nul 2>&1
timeout /t 2 /nobreak >nul

:: 安装服务
echo.
echo [信息] 安装 OCR 服务...
"%NSSM_PATH%" install OCRCaptcha "%PYTHON_PATH%"
"%NSSM_PATH%" set OCRCaptcha AppParameters "\"%SCRIPT_DIR%ocr_service.py\""
"%NSSM_PATH%" set OCRCaptcha DisplayName "OCR Captcha Service"
"%NSSM_PATH%" set OCRCaptcha Description "验证码自动识别服务，为浏览器插件提供 OCR 功能"
"%NSSM_PATH%" set OCRCaptcha Start SERVICE_AUTO_START
"%NSSM_PATH%" set OCRCaptcha AppStdout "%SCRIPT_DIR%logs\service.log"
"%NSSM_PATH%" set OCRCaptcha AppStderr "%SCRIPT_DIR%logs\error.log"
"%NSSM_PATH%" set OCRCaptcha AppRotateFiles 1
"%NSSM_PATH%" set OCRCaptcha AppRotateOnline 1
"%NSSM_PATH%" set OCRCaptcha AppRotateSeconds 86400

:: 创建日志目录
if not exist "%SCRIPT_DIR%logs" mkdir "%SCRIPT_DIR%logs"

:: 启动服务
echo.
echo [信息] 启动服务...
"%NSSM_PATH%" start OCRCaptcha

:: 检查服务状态
timeout /t 3 /nobreak >nul
sc query OCRCaptcha | findstr "RUNNING" >nul
if %errorLevel% equ 0 (
    echo.
    echo ==========================================
    echo  [成功] OCR 服务已安装并运行！
    echo ==========================================
    echo.
    echo 服务信息:
    echo   - 服务名称: OCRCaptcha
    echo   - 显示名称: OCR Captcha Service
    echo   - 运行地址: http://127.0.0.1:5000
    echo   - 日志文件: %SCRIPT_DIR%logs\
    echo.
    echo 管理命令:
    echo   - 停止服务: net stop OCRCaptcha
    echo   - 启动服务: net start OCRCaptcha
    echo   - 卸载服务: uninstall_service.bat
    echo.
    echo 按任意键退出...
) else (
    echo.
    echo [警告] 服务可能未正常启动，请检查日志
    echo 日志位置: %SCRIPT_DIR%logs\error.log
    pause
)

pause
