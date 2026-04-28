(function () {
  const api_Url = "https://sahayak-ai-lilac.vercel.app/api/chat";
  const scripttag = document.currentScript;
  const ownerId = scripttag.getAttribute("data-owner-id");

  if (!ownerId) {
    console.error("Support AI Error: Owner ID is missing from script tag.");
    return;
  }

  // Load Font
  const fontLink = document.createElement("link");
  fontLink.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
  fontLink.rel = "stylesheet";
  document.head.appendChild(fontLink);

  // --- Create Launcher Button ---
  const button = document.createElement("div");
  button.innerHTML = "🗨️";
  Object.assign(button.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    width: "60px",
    height: "60px",
    borderRadius: "30px",
    background: "#000",
    color: "#fff",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "24px",
    cursor: "pointer",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    zIndex: "999999",
    transition: "transform 0.2s ease, background 0.2s ease",
  });

  button.onmouseover = () => {
    button.style.transform = "scale(1.05)";
  };
  button.onmouseout = () => {
    button.style.transform = "scale(1)";
  };
  document.body.appendChild(button);

  // --- Create Chat Box ---
  const box = document.createElement("div");
  Object.assign(box.style, {
    position: "fixed",
    bottom: "95px",
    right: "24px",
    width: "350px",
    maxWidth: "calc(100vw - 48px)",
    height: "500px",
    maxHeight: "calc(100vh - 120px)",
    background: "#fff",
    borderRadius: "20px",
    boxShadow: "0 12px 48px rgba(0,0,0,0.15)",
    display: "none",
    flexDirection: "column",
    overflow: "hidden",
    zIndex: "999999",
    fontFamily: "'Inter', sans-serif",
    opacity: "0",
    transform: "translateY(20px)",
    transition: "opacity 0.3s ease, transform 0.3s ease",
  });

  box.innerHTML = `
    <div style="background:#000; color:#fff; padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:600; font-size:15px;">Support Assistant</div>
        
      </div>
      <span id="chat-close" style="cursor:pointer; font-size:14px; padding:4px;">╳</span>
    </div>

    <div id="chat-messages" style="flex:1; padding:20px; overflow-y:auto; background:#fff; display:flex; flex-direction:column; gap:12px;"></div>

    <div style="padding:16px; border-top:1px solid #f3f4f6; display:flex; gap:8px; background:#fff;">
      <input id="chat-input" type="text" placeholder="Type your question..." 
        style="flex:1; padding:10px 14px; border:1px solid #e5e7eb; border-radius:10px; font-size:14px; outline:none; transition:border 0.2s;" />
      <button id="chat-send" style="padding:0 16px; background:#000; color:#fff; border:none; border-radius:10px; font-weight:500; font-size:14px; cursor:pointer;">Send</button>
    </div>
  `;

  document.body.appendChild(box);

  // --- Toggle Logic with Animation ---
  const toggleChat = (show) => {
    if (show) {
      box.style.display = "flex";
      setTimeout(() => {
        box.style.opacity = "1";
        box.style.transform = "translateY(0)";
      }, 10);
    } else {
      box.style.opacity = "0";
      box.style.transform = "translateY(20px)";
      setTimeout(() => {
        box.style.display = "none";
      }, 300);
    }
  };

  button.onclick = () => toggleChat(box.style.display === "none");
  document.querySelector("#chat-close").onclick = () => toggleChat(false);

  const input = document.querySelector("#chat-input");
  const sendBtn = document.querySelector("#chat-send");
  const messageArea = document.querySelector("#chat-messages");

  // --- Message UI ---
  function addMessage(text, from) {
    const bubble = document.createElement("div");
    // Simple line break support
    bubble.innerText = text;

    Object.assign(bubble.style, {
      maxWidth: "85%",
      padding: "10px 14px",
      borderRadius: "16px",
      fontSize: "14px",
      lineHeight: "1.5",
      alignSelf: from === "user" ? "flex-end" : "flex-start",
      background: from === "user" ? "#000" : "#f3f4f6",
      color: from === "user" ? "#fff" : "#1f2937",
      borderTopRightRadius: from === "user" ? "4px" : "16px",
      borderTopLeftRadius: from === "user" ? "16px" : "4px",
      animation: "messageAppear 0.3s ease-out forwards",
    });

    messageArea.appendChild(bubble);
    messageArea.scrollTop = messageArea.scrollHeight;
  }

  // Define Message Animation
  const styleSheet = document.createElement("style");
  styleSheet.innerText = `
    @keyframes messageAppear {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #chat-input:focus { border-color: #000 !important; }
  `;
  document.head.appendChild(styleSheet);

  const sendMessage = async () => {
    const text = input.value.trim();
    if (text === "") return;

    addMessage(text, "user");
    input.value = "";

    const typing = document.createElement("div");
    typing.innerHTML = `<span style="display:inline-block; animation:pulse 1s infinite">Typing...</span>`;
    Object.assign(typing.style, {
      fontSize: "14px",
      color: "#9ca3af",
      marginLeft: "4px",
    });
    messageArea.appendChild(typing);
    messageArea.scrollTop = messageArea.scrollHeight;

    try {
      const response = await fetch(api_Url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, message: text }),
      });

      const data = await response.json();

      if (typing.parentNode) messageArea.removeChild(typing);

      if (data && data.message) {
        // This handles { message: "Friendly error" } from your backend catch block
        addMessage(data.message, "bot");
      } else if (typeof data === "string") {
        // This handles the direct string response from a successful AI generation
        addMessage(data, "bot");
      } else {
        addMessage(
          "I'm sorry, I encountered an error. Please contact support.",
          "bot",
        );
      }

      // const data = await response.json();
      // messageArea.removeChild(typing);

      // if (typeof data === "string") {
      //   addMessage(data, "bot");
      // } else if (data && data.message) {
      //   addMessage(data.message, "bot");
      // } else {
      //   addMessage(
      //     "I'm sorry, I encountered an error. Please contact support.",
      //     "bot",
      //   );
      // }
    } catch (error) {
      if (typing.parentNode) messageArea.removeChild(typing);
      addMessage("Connection error. Is the server running?", "bot");
      console.log(error);
    }
  };

  sendBtn.onclick = sendMessage;
  input.onkeypress = (e) => {
    if (e.key === "Enter") sendMessage();
  };
})();
