package com.codefest.api.chat;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "chat_messages")
public class ChatMessage {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 32)
  private String role;

  @Column(nullable = false, columnDefinition = "text")
  private String content;

  @CreationTimestamp
  @Column(name = "created_at", nullable = false, updatable = false)
  private OffsetDateTime createdAt;

  protected ChatMessage() {}

  public ChatMessage(String role, String content) {
    this.role = role;
    this.content = content;
  }

  public Long getId() {
    return id;
  }

  public String getRole() {
    return role;
  }

  public String getContent() {
    return content;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }
}
