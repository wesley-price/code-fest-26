package com.codefest.api.hotel;

import java.math.BigDecimal;
import java.util.List;

public record HotelResponse(
    Long id,
    String name,
    String city,
    String country,
    String description,
    BigDecimal nightlyRate,
    String currency,
    int availableRooms,
    List<RoomResponse> rooms) {
  static HotelResponse from(Hotel hotel) {
    return new HotelResponse(
        hotel.getId(),
        hotel.getName(),
        hotel.getCity(),
        hotel.getCountry(),
        hotel.getDescription(),
        hotel.getNightlyRate(),
        hotel.getCurrency(),
        hotel.getAvailableRooms(),
        hotel.getRooms().stream().map(RoomResponse::from).toList());
  }
}
