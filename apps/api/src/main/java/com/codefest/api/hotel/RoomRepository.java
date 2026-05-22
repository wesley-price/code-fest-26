package com.codefest.api.hotel;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomRepository extends JpaRepository<Room, Long> {
  boolean existsByHotel(Hotel hotel);
}
