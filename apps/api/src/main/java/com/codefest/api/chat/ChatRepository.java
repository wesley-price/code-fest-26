package com.codefest.api.chat;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatRepository extends JpaRepository<ChatMessage, Long> {
  List<ChatMessage> findTop50ByOrderByCreatedAtAsc();
}
