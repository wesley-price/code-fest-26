package com.codefest.api.hotel;

import java.math.BigDecimal;

public record RoomResponse(Long id, String name, boolean hasView, BigDecimal nightlyRate, String currency, int availableCount) {
  static RoomResponse from(Room room) {
    return new RoomResponse(
        room.getId(),
        room.getName(),
        room.isHasView(),
        room.getNightlyRate(),
        room.getCurrency(),
        room.getAvailableCount());
  }
}
