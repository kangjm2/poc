package com.vdt.analyzer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class VdtAnalyzerApplication {
    public static void main(String[] args) {
        SpringApplication.run(VdtAnalyzerApplication.class, args);
    }
}
