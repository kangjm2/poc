package com.vdt.analyzer.repo;

import com.vdt.analyzer.domain.SignalingMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepo extends JpaRepository<SignalingMessage, Long> {
    List<SignalingMessage> findBySessionIdOrderByTsAsc(Long sessionId);
}
