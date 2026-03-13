import time
import random
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.edge.options import Options

# ================= 配置区域 =================
# 搜索次数
MAX_SEARCH_COUNT = 30

# 你的文案（用于提取搜索词）
TEXT_CONTENT = "数字的跳动永不停歇，从黄金分割的比例到素数的孤独分布，每一个维度都存在着某种必然的偶然。微型无人机在钢铁丛林间穿梭，它们的传感器捕捉着温度的变化、湿度的波动以及人类情感中那些无法被量化的微小震颤。数据流如瀑布般从虚构的云端坠落，撞击在防火墙的岩石上溅起幽蓝色的火花。城市在梦境中自我重构，摩天大楼像生长的晶体一样向天空伸展，而地下深处的电缆则像发光的神经元一样传递着古老的秘密。光影在剥落的墙皮上作画，描绘着一场关于热力学第二定律的宏大葬礼，熵值的增加不可逆转，就像落叶无法回到枝头，就像泼出的水无法收回瓶中。在微观世界里，波函数在不断地扩散与重叠，计算着每一个微粒可能出现的概率，而在宏观视角下，星系的碰撞不过是深渊中两粒微尘的轻柔接触。古老的预言被编码进现代的编译器，逻辑门在开关之间决定了信息的生死存亡，没有中间地带，只有绝对的零与一，只有永恒的对立与统一。风从北方吹来，带着极地的寒意和未被翻译的语言，吹过荒废的实验室和繁忙的交易大厅，将现实的边缘吹得模糊不清。我们身处一个由信息构筑的迷宫，每一个出口都通往另一个入口，每一次解答都引向更深层的疑问。时钟的指针在真空里旋转，不再度量时间，而是度量着寂静的深度。在这段随机生成的叙事长河中，意义本身就是一种波动，它随着观察者的目光而产生，又随着思绪的漂移而消散。代码的海洋里航行着名为思维的帆船，锚点沉入潜意识的淤泥，寻找着最初的定义。没有起点，也没有终点，只有这段不断自我复制、自我修正、自我湮灭的文字，在屏幕的微光中跳动，直到最后一个句点被逻辑的黑洞吞噬。"

# 将文案切分为搜索词列表
SEARCH_WORDS = [x for x in TEXT_CONTENT.replace("。", ",").replace("！", ",").split(",") if len(x) > 2]


# ================= 主程序 =================

def run_automation():
    print("🚀 正在启动浏览器...")

    # 1. 启动 Edge 浏览器
    # 这里的 detach=True 可以在脚本结束后保持浏览器打开（方便观察），如果想自动关闭可去掉
    edge_options = Options()
    edge_options.add_experimental_option("detach", True)

    try:
        driver = webdriver.Edge(options=edge_options)
    except Exception as e:
        print(f"❌ 启动失败，可能是没有安装 Edge 驱动或 Selenium 版本过低。\n错误信息: {e}")
        return

    try:
        # 2. 打开 Bing 首页
        driver.get("https://cn.bing.com")
        time.sleep(2)  # 等待网页加载

        for i in range(MAX_SEARCH_COUNT):
            if i >= len(SEARCH_WORDS):
                break  # 词库用完了就停止

            word = SEARCH_WORDS[i]
            print(f"[{i + 1}/{MAX_SEARCH_COUNT}] 正在模拟搜索: {word}")

            try:
                # 3. 寻找搜索框
                # Bing 首页和结果页的搜索框 ID 通常都是 'sb_form_q'
                search_box = driver.find_element(By.ID, "sb_form_q")

                # 4. 清空搜索框 (防止上次的字还在)
                search_box.clear()

                # 5. 【核心】模拟人类打字：一个字一个字输入
                for char in word:
                    search_box.send_keys(char)
                    # 随机延迟 0.05 ~ 0.2 秒，模拟打字手速
                    time.sleep(random.uniform(0.05, 0.2))

                # 6. 稍微停顿一下，假装在确认输入
                time.sleep(random.uniform(0.5, 1.0))

                # 7. 模拟按下回车键
                search_box.send_keys(Keys.ENTER)

                # 8. 【核心】浏览等待：模拟读页面
                # 必须等待页面刷新，否则无法进行下一次循环寻找元素
                # 随机等待 5 ~ 10 秒
                wait_time = random.uniform(5, 10)
                print(f"   ⏳ 等待 {wait_time:.1f} 秒...")
                time.sleep(wait_time)

            except Exception as e:
                print(f"   ⚠️ 发生小错误 (可能是元素没找到): {e}")
                # 如果出错，重新刷新页面，防止卡死
                driver.get("https://cn.bing.com")
                time.sleep(3)

        print("✅ 所有任务执行完毕！")

    except Exception as e:
        print(f"❌ 程序发生严重错误: {e}")
    finally:
        # 任务完成后关闭浏览器
        driver.quit()


if __name__ == "__main__":
    run_automation()
