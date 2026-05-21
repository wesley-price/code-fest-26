package com.codefest.api.hotel;

import jakarta.validation.constraints.NotBlank;

public record CompleteReservationRequest(
    @NotBlank String phoneNumber, @NotBlank String billingReference) {}
