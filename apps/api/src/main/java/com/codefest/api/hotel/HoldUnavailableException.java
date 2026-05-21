package com.codefest.api.hotel;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class HoldUnavailableException extends RuntimeException {
  public HoldUnavailableException(String message) {
    super(message);
  }
}
