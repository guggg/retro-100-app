import { render, screen, fireEvent, act } from "@testing-library/react";
import ChatPage from "../page";

// --- Mocks ---

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => ({ memberId: "test-user" }),
  useRouter: () => ({ push: mockPush }),
}));

global.fetch = jest.fn(() => new Promise(() => {})) as any;

const STORAGE_KEY = "retro-chat-test-user";
const savedState = JSON.stringify({
  messages: [
    { role: "user", content: "嗨，我準備好了！" },
    { role: "assistant", content: "你好！歡迎來到回顧對話。" },
  ],
  summaryDetected: false,
});

function createMockRecognition() {
  const instance = {
    lang: "",
    interimResults: false,
    continuous: false,
    onresult: null as any,
    onend: null as any,
    onerror: null as any,
    start: jest.fn(),
    stop: jest.fn(() => {
      if (instance.onend) instance.onend();
    }),
    abort: jest.fn(),
  };
  return instance;
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, savedState);
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
});

describe("ChatPage - Voice Input", () => {
  it("renders the mic button", async () => {
    await act(async () => { render(<ChatPage />); });
    const micBtn = screen.getByTitle("語音輸入");
    expect(micBtn).toBeInTheDocument();
    expect(micBtn).toHaveTextContent("🎤");
  });

  it("shows alert when SpeechRecognition is not supported", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    await act(async () => { render(<ChatPage />); });
    await act(async () => { fireEvent.click(screen.getByTitle("語音輸入")); });
    expect(alertSpy).toHaveBeenCalledWith("你的瀏覽器不支援語音輸入，請使用 Chrome 或 Edge。");
    alertSpy.mockRestore();
  });

  it("starts listening with correct config (webkitSpeechRecognition)", async () => {
    const mock = createMockRecognition();
    (window as any).webkitSpeechRecognition = jest.fn(() => mock);
    await act(async () => { render(<ChatPage />); });
    const micBtn = screen.getByTitle("語音輸入");
    await act(async () => { fireEvent.click(micBtn); });
    expect(mock.start).toHaveBeenCalled();
    expect(mock.lang).toBe("zh-TW");
    expect(mock.interimResults).toBe(true);
    expect(mock.continuous).toBe(true);
    expect(micBtn).toHaveTextContent("⏹");
  });

  it("starts listening via standard SpeechRecognition", async () => {
    const mock = createMockRecognition();
    (window as any).SpeechRecognition = jest.fn(() => mock);
    await act(async () => { render(<ChatPage />); });
    await act(async () => { fireEvent.click(screen.getByTitle("語音輸入")); });
    expect(mock.start).toHaveBeenCalled();
  });

  it("stops listening when mic button is clicked again", async () => {
    const mock = createMockRecognition();
    (window as any).webkitSpeechRecognition = jest.fn(() => mock);
    await act(async () => { render(<ChatPage />); });
    const micBtn = screen.getByTitle("語音輸入");
    await act(async () => { fireEvent.click(micBtn); });
    await act(async () => { fireEvent.click(micBtn); });
    expect(mock.stop).toHaveBeenCalled();
    expect(micBtn).toHaveTextContent("🎤");
  });

  it("fills input with final transcript", async () => {
    const mock = createMockRecognition();
    mock.stop = jest.fn();
    (window as any).webkitSpeechRecognition = jest.fn(() => mock);
    await act(async () => { render(<ChatPage />); });
    await act(async () => { fireEvent.click(screen.getByTitle("語音輸入")); });

    await act(async () => {
      mock.onresult({
        resultIndex: 0,
        results: {
          length: 1,
          0: { 0: { transcript: "這個 sprint 做得不錯" }, isFinal: true, length: 1 },
        },
      });
    });

    expect(screen.getByPlaceholderText("輸入你的想法...")).toHaveValue("這個 sprint 做得不錯");
  });

  it("shows interim results while speaking", async () => {
    const mock = createMockRecognition();
    mock.stop = jest.fn();
    (window as any).webkitSpeechRecognition = jest.fn(() => mock);
    await act(async () => { render(<ChatPage />); });
    await act(async () => { fireEvent.click(screen.getByTitle("語音輸入")); });

    await act(async () => {
      mock.onresult({
        resultIndex: 0,
        results: {
          length: 1,
          0: { 0: { transcript: "這個" }, isFinal: false, length: 1 },
        },
      });
    });

    const textarea = screen.getByPlaceholderText("輸入你的想法...") as HTMLTextAreaElement;
    expect(textarea.value).toContain("這個");
  });

  it("drops interim text when recognition ends, keeps only finals", async () => {
    const mock = createMockRecognition();
    mock.stop = jest.fn();
    (window as any).webkitSpeechRecognition = jest.fn(() => mock);
    await act(async () => { render(<ChatPage />); });
    await act(async () => { fireEvent.click(screen.getByTitle("語音輸入")); });

    // Final + interim
    await act(async () => {
      mock.onresult({
        resultIndex: 0,
        results: {
          length: 2,
          0: { 0: { transcript: "最終結果" }, isFinal: true, length: 1 },
          1: { 0: { transcript: "臨時的" }, isFinal: false, length: 1 },
        },
      });
    });

    const textarea = screen.getByPlaceholderText("輸入你的想法...") as HTMLTextAreaElement;
    expect(textarea.value).toContain("最終結果");
    expect(textarea.value).toContain("臨時的");

    // End recognition — interim should be dropped
    await act(async () => { mock.onend(); });
    expect(textarea.value).toBe("最終結果");
  });

  it("reverts to mic icon on recognition error", async () => {
    const mock = createMockRecognition();
    mock.stop = jest.fn();
    (window as any).webkitSpeechRecognition = jest.fn(() => mock);
    await act(async () => { render(<ChatPage />); });
    const micBtn = screen.getByTitle("語音輸入");
    await act(async () => { fireEvent.click(micBtn); });
    expect(micBtn).toHaveTextContent("⏹");

    await act(async () => { mock.onerror({ error: "no-speech" }); });
    expect(micBtn).toHaveTextContent("🎤");
  });

  it("accumulates multiple final results", async () => {
    const mock = createMockRecognition();
    mock.stop = jest.fn();
    (window as any).webkitSpeechRecognition = jest.fn(() => mock);
    await act(async () => { render(<ChatPage />); });
    await act(async () => { fireEvent.click(screen.getByTitle("語音輸入")); });

    await act(async () => {
      mock.onresult({
        resultIndex: 0,
        results: {
          length: 1,
          0: { 0: { transcript: "第一句" }, isFinal: true, length: 1 },
        },
      });
    });

    await act(async () => {
      mock.onresult({
        resultIndex: 1,
        results: {
          length: 2,
          0: { 0: { transcript: "第一句" }, isFinal: true, length: 1 },
          1: { 0: { transcript: "第二句" }, isFinal: true, length: 1 },
        },
      });
    });

    const textarea = screen.getByPlaceholderText("輸入你的想法...") as HTMLTextAreaElement;
    expect(textarea.value).toContain("第一句");
    expect(textarea.value).toContain("第二句");
  });

  it("mic button is disabled while streaming", async () => {
    await act(async () => { render(<ChatPage />); });
    const textarea = screen.getByPlaceholderText("輸入你的想法...");
    await act(async () => { fireEvent.change(textarea, { target: { value: "測試" } }); });
    await act(async () => { fireEvent.click(screen.getByText("↑")); });
    expect(screen.getByTitle("語音輸入")).toBeDisabled();
  });

  it("cleans up recognition on unmount", async () => {
    const mock = createMockRecognition();
    mock.stop = jest.fn();
    (window as any).webkitSpeechRecognition = jest.fn(() => mock);

    let unmount: () => void;
    await act(async () => {
      const result = render(<ChatPage />);
      unmount = result.unmount;
    });

    await act(async () => { fireEvent.click(screen.getByTitle("語音輸入")); });
    expect(mock.start).toHaveBeenCalled();

    await act(async () => { unmount(); });
    expect(mock.abort).toHaveBeenCalled();
  });

  it("cleans up old instance if ref still exists when starting new one", async () => {
    const mock1 = createMockRecognition();
    // Simulate: stop does NOT call onend (e.g. browser delay)
    mock1.stop = jest.fn();
    const mock2 = createMockRecognition();
    mock2.stop = jest.fn();

    let callCount = 0;
    (window as any).webkitSpeechRecognition = jest.fn(() => {
      callCount++;
      return callCount === 1 ? mock1 : mock2;
    });

    await act(async () => { render(<ChatPage />); });
    const micBtn = screen.getByTitle("語音輸入");

    // Start first
    await act(async () => { fireEvent.click(micBtn); });
    // Simulate onend firing (stop clicked)
    await act(async () => { mock1.onend(); });
    // Start second — mock1 ref was nulled by onend, so no abort needed
    await act(async () => { fireEvent.click(micBtn); });

    expect(mock1.stop).not.toHaveBeenCalled(); // was stopped via onend
    expect(mock2.start).toHaveBeenCalled();
  });
});
