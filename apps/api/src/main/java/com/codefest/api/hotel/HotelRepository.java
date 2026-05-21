package com.codefest.api.hotel;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HotelRepository extends JpaRepository<Hotel, Long> {
  boolean existsByNameIgnoreCaseAndCityIgnoreCase(String name, String city);

  List<Hotel> findByCityContainingIgnoreCaseOrderByNameAsc(String city);

  List<Hotel> findAllByOrderByNameAsc();
}
