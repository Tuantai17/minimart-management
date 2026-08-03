import { useState, useEffect, useCallback } from "react";
import { storage } from "../utils/storage";

/**
 * Hook đếm ngược thời gian hỗ trợ phục hồi F5
 */
export function useCountdown(initialSeconds: number = 300, storageKey?: string, autoStart: boolean = true) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(false);

  // 1. Phục hồi và Tự Khởi Động (Chỉ chạy 1 lần khi Mount)
  useEffect(() => {
    let mounted = true;

    const initTimer = async () => {
      let isRestoredAndRunning = false;

      // Cố gắng cứu vãn thời gian từ F5
      if (storageKey) {
        const savedEndTimeStr = await storage.get(storageKey);
        if (savedEndTimeStr) {
          const endTimeStamp = parseInt(savedEndTimeStr, 10);
          const currentTime = Date.now();
          if (endTimeStamp > currentTime) {
            const remaining = Math.floor((endTimeStamp - currentTime) / 1000);
            if (mounted) {
              setSeconds(remaining);
              setIsActive(true);
              isRestoredAndRunning = true;
            }
          } else {
            // Quá hạn
            await storage.remove(storageKey);
          }
        }
      }

      // Nếu không có gì để cứu, mà lại bật AutoStart -> Cho chạy từ đầu
      if (!isRestoredAndRunning && autoStart && mounted) {
        setSeconds(initialSeconds);
        setIsActive(true);
        if (storageKey) {
          const endFutureTime = Date.now() + initialSeconds * 1000;
          await storage.set(storageKey, endFutureTime.toString());
        }
      }
    };

    initTimer();
    return () => { mounted = false; };
  }, [storageKey, initialSeconds, autoStart]);

  // 2. Logic nhịp đập 1 Giây
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((prevSeconds) => {
          if (prevSeconds <= 1) {
             clearInterval(interval);
             setIsActive(false);
             if (storageKey) storage.remove(storageKey);
             return 0;
          }
          return prevSeconds - 1;
        });
      }, 1000);
    } else if (seconds === 0) {
      setIsActive(false);
    }

    return () => clearInterval(interval);
  }, [isActive, seconds, storageKey]);

  // 3. Các hàm điều khiển thủ công (Gửi lại mã OTP)
  const startCountdown = useCallback(async () => {
    setSeconds(initialSeconds);
    setIsActive(true);
    if (storageKey) {
      const endFutureTime = Date.now() + initialSeconds * 1000;
      await storage.set(storageKey, endFutureTime.toString());
    }
  }, [initialSeconds, storageKey]);

  const stopCountdown = useCallback(() => setIsActive(false), []);
  
  const resetCountdown = useCallback(async (newSeconds: number = initialSeconds) => {
    setSeconds(newSeconds);
    setIsActive(true); // Bấm gửi lại OTP tức là cho quay tiếp
    if (storageKey) {
      const endFutureTime = Date.now() + newSeconds * 1000;
      await storage.set(storageKey, endFutureTime.toString());
    }
  }, [initialSeconds, storageKey]);

  const formatTime = () => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return { seconds, isActive, startCountdown, stopCountdown, resetCountdown, formatTime };
}
