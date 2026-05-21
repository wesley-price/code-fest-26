package com.codefest.api.hotel;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HotelHoldRepository extends JpaRepository<HotelHold, UUID> {
  @Query(
      """
      select coalesce(sum(h.rooms), 0)
      from HotelHold h
      where h.hotel.id = :hotelId
        and (h.status = :confirmedStatus or (h.status = :heldStatus and h.expiresAt > :now))
        and h.checkIn < :checkOut
        and h.checkOut > :checkIn
      """)
  long countReservedRooms(
      @Param("hotelId") Long hotelId,
      @Param("checkIn") LocalDate checkIn,
      @Param("checkOut") LocalDate checkOut,
      @Param("now") OffsetDateTime now,
      @Param("heldStatus") HoldStatus heldStatus,
      @Param("confirmedStatus") HoldStatus confirmedStatus);
}
