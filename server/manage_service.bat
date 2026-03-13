@echo off
chcp 65001 >nul
echo ==========================================
echo  OCR 服务管理工具
echo ==========================================
echo.
echo  [1] 安装并启动服务
echo  [2] 卸载服务
echo  [3] 启动服务
echo  [4] 停止服务
echo  [5] 重启服务
echo  [6] 查看服务状态
echo  [7] 查看日志
echo  [8] 退出
echo.
set /p choice=请选择操作 (1-8):

if "%choice%"=="1" goto install
if "%choice%"=="2" goto uninstall
if "%choice%"=="3" goto start
if "%choice%"=="4" goto stop
if "%choice%"=="5" goto restart
if "%choice%"=="6" goto status
if "%choice%"=="7" goto logs
if "%choice%"=="8" goto end

echo 无效选择
goto end

:install
call "%~dp0install_service.bat"
goto end

:uninstall
call "%~dp0uninstall_service.bat"
goto end

:start
echo [信息] 启动服务...
net start OCRCaptcha
pause
goto end

:stop
echo [信息] 停止服务...
net stop OCRCaptcha
pause
goto end

:restart
echo [信息] 重启服务...
net stop OCRCaptcha
net start OCRCaptcha
pause
goto end

:status
echo [信息] 服务状态:
sc query OCRCaptcha
echo.
echo [信息] 测试服务连接:
curl -s http://127.0.0.1:5000/health || echo 服务未响应
pause
goto end

:logs
echo [信息] 打开日志目录...
start "" "%~dp0logs"
goto end

:end
