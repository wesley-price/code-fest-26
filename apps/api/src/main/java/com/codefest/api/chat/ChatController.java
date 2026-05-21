package com.codefest.api.chat;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chat")
@CrossOrigin(origins = {"http://localhost:5173", "http://127.0.0.1:5173"})
public class ChatController {
  private final ChatRepository chatRepository;

  public ChatController(ChatRepository chatRepository) {
    this.chatRepository = chatRepository;
  }

  @GetMapping
  public List<ChatMessage> history() {
    return chatRepository.findTop50ByOrderByCreatedAtAsc();
  }

  @PostMapping
  public ChatResponse send(@Valid @RequestBody ChatRequest request) {
    chatRepository.save(new ChatMessage("user", request.message()));

    String reply =
        "This is a deterministic mock response from the Spring Boot API. You said: "
            + request.message();
    ChatMessage assistantMessage = chatRepository.save(new ChatMessage("assistant", reply));

    return new ChatResponse(assistantMessage.getId(), reply);
  }
}
