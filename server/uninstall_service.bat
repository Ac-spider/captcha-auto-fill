@echo off
chcp 65001 >nul
echo ==========================================
echo  卸载 OCR Windows 服务
echo ==========================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 请以管理员身份运行此脚本！
    pause
    exit /b 1
)

set "NSSM_PATH=%~dp0nssm.exe"

echo [信息] 停止服务...
"%NSSM_PATH%" stop OCRCaptcha >nul 2>&1
timeout /t 2 /nobreak >nul

echo [信息] 移除服务...
"%NSSM_PATH%" remove OCRCaptcha confirm >nul 2>&1

if %errorLevel% equ 0 (
    echo.
    echo [成功] OCR 服务已卸载！
) else (
    echo [警告] 服务可能不存在或已被移除
)

echo.
pause
