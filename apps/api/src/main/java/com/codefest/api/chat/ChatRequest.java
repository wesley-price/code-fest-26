package com.codefest.api.chat;

import jakarta.validation.constraints.NotBlank;

public record ChatRequest(@NotBlank String message) {}
