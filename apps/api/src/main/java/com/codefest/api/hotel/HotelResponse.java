package com.codefest.api.hotel;

import java.math.BigDecimal;

public record HotelResponse(
    Long id,
    String name,
    String city,
    String country,
    String description,
    BigDecimal nightlyRate,
    String currency,
    int availableRooms) {
  static HotelResponse from(Hotel hotel) {
    return new HotelResponse(
        hotel.getId(),
        hotel.getName(),
        hotel.getCity(),
        hotel.getCountry(),
        hotel.getDescription(),
        hotel.getNightlyRate(),
        hotel.getCurrency(),
        hotel.getAvailableRooms());
  }
}
