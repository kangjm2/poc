package com.vdt.analyzer.repo;

import com.vdt.analyzer.domain.NetworkEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EventRepo extends JpaRepository<NetworkEvent, Long> {
    List<NetworkEvent> findBySessionIdOrderByTsAsc(Long sessionId);
}
