package com.codefest.api.hotel;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.NOT_FOUND)
public class HotelNotFoundException extends RuntimeException {
  public HotelNotFoundException(Long hotelId) {
    super("Hotel not found: " + hotelId);
  }
}
