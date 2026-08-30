package com.vdt.analyzer.repo;

import com.vdt.analyzer.domain.CellRef;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CellRefRepo extends JpaRepository<CellRef, Long> {
    List<CellRef> findBySessionIdOrderByPciAsc(Long sessionId);
}
